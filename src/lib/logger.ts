/**
 * Structured logger.
 *
 * Writes one JSON object per log line to stdout/stderr so log aggregators
 * (Sentry, Datadog, Vercel) can parse fields without regex tricks. Replaces
 * the `console.log/error('...', err)` pattern that produced unstructured
 * multi-line output and made cross-request correlation painful.
 *
 * Why not pino? The audit recommended pino-or-winston, but both pull in
 * meaningful client-bundle weight if accidentally imported from a route
 * file. This module is deliberately small and dep-free; swap in pino later
 * by changing the four write functions below — call sites stay the same.
 *
 * Usage:
 *
 *   import { logger } from '@/lib/logger';
 *   logger.info({ event: 'campaign.start', campaignId, contactCount });
 *   logger.error({ event: 'webhook.delivery_failed', webhookId }, error);
 *
 * The first arg is a key/value bag for the structured fields. The optional
 * second arg is an Error — its `message` and `stack` are attached under the
 * `err.*` keys so log aggregators can group by error type.
 */

import * as Sentry from '@sentry/nextjs';

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
    [key: string]: unknown;
    event?: string;
    component?: string;
}

const APP_ENV = process.env.NODE_ENV || 'development';
const SERVICE = process.env.LOG_SERVICE_NAME || 'montrai';

/* ------------------------------------------------------------------ Mongo transport
 *
 * Purely-additive persistence: when LOG_PERSIST=true and we're on the server,
 * eligible log lines are buffered and flushed in batches into the capped
 * `system_logs` collection (read back by the /admin/logs super-admin browser).
 *
 * Hard constraints:
 *  - Guarded by `typeof window === 'undefined'` + a LAZY dynamic import of the
 *    repository so Mongoose NEVER enters the client bundle.
 *  - Fail-soft: every persistence path is wrapped in try/catch and drops the
 *    batch on error (stdout already has it). Never throws from the logger.
 *  - Bounded: the pending buffer is capped so a Mongo outage can't OOM.
 */
const LOG_PERSIST_ENABLED = process.env.LOG_PERSIST === 'true';
const LOG_PERSIST_LEVEL = (process.env.LOG_PERSIST_LEVEL || 'info') as Level;
const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const PERSIST_FLUSH_AT = 50; // flush when the buffer reaches this many lines
const PERSIST_MAX_BUFFER = 5000; // drop oldest beyond this (Mongo-outage guard)
const PERSIST_FLUSH_MS = 2000;

interface PersistDoc {
    ts: Date;
    level: string;
    service: string;
    env: string;
    event?: string;
    component?: string;
    message?: string;
    userId?: string;
    requestId?: string;
    err?: { name?: string; message?: string; stack?: string };
    fields?: Record<string, unknown>;
}

const persistBuffer: PersistDoc[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

const SECRET_KEY_RE = /password|secret|token|authorization|api[_-]?key|encryption|cookie|dsn/i;

/** Shallow-redact secret-looking top-level keys; recurse one level into plain objects. */
function scrubFields(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (SECRET_KEY_RE.test(key)) {
            out[key] = '[redacted]';
        } else if (
            depth < 2 &&
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.getPrototypeOf(value) === Object.prototype
        ) {
            out[key] = scrubFields(value as Record<string, unknown>, depth + 1);
        } else {
            out[key] = value;
        }
    }
    return out;
}

function shouldPersist(level: Level): boolean {
    if (!LOG_PERSIST_ENABLED) return false;
    if (level === 'debug') return false; // never persist debug
    return LEVEL_ORDER[level] >= LEVEL_ORDER[LOG_PERSIST_LEVEL];
}

function ensureFlushTimer(): void {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
        void flushPersistBuffer();
    }, PERSIST_FLUSH_MS);
    // Never hold the process open for the logger.
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

async function flushPersistBuffer(): Promise<void> {
    if (flushing || persistBuffer.length === 0) return;
    flushing = true;
    const batch = persistBuffer.splice(0, persistBuffer.length);
    try {
        const { systemLogRepository } = await import('@/lib/db/repository/system-log.repository');
        await systemLogRepository.insertBatch(batch);
    } catch {
        // Drop the batch — stdout already has these lines. Never throw.
    } finally {
        flushing = false;
    }
}

/** Build a persist doc from an emit payload, scrubbing + segregating custom fields. */
function persist(level: Level, fields: LogFields, err?: unknown): void {
    try {
        if (typeof window !== 'undefined') return; // server-only — keep Mongoose out of client bundle
        if (!shouldPersist(level)) return;

        const { event, component, message, userId, requestId, ...rest } = fields as LogFields & {
            message?: string;
            userId?: string;
            requestId?: string;
        };

        const scrubbedRest = scrubFields(rest);
        const errDoc = serializeError(err);

        const doc: PersistDoc = {
            ts: new Date(),
            level,
            service: SERVICE,
            env: APP_ENV,
            event: typeof event === 'string' ? event : undefined,
            component: typeof component === 'string' ? component : undefined,
            message:
                typeof message === 'string'
                    ? message
                    : typeof event === 'string'
                      ? event
                      : undefined,
            userId: typeof userId === 'string' ? userId : undefined,
            requestId: typeof requestId === 'string' ? requestId : undefined,
            err: errDoc
                ? {
                      name: typeof errDoc.name === 'string' ? errDoc.name : undefined,
                      message: typeof errDoc.message === 'string' ? errDoc.message : undefined,
                      stack: typeof errDoc.stack === 'string' ? errDoc.stack : undefined,
                  }
                : undefined,
            fields: Object.keys(scrubbedRest).length ? scrubbedRest : undefined,
        };

        persistBuffer.push(doc);
        // Bound the buffer so a Mongo outage can't grow it without limit.
        if (persistBuffer.length > PERSIST_MAX_BUFFER) {
            persistBuffer.splice(0, persistBuffer.length - PERSIST_MAX_BUFFER);
        }

        ensureFlushTimer();
        if (persistBuffer.length >= PERSIST_FLUSH_AT) {
            void flushPersistBuffer();
        }
    } catch {
        // Never let persistence break logging.
    }
}

function shouldEmit(level: Level): boolean {
    // In production, drop debug lines to keep volume sane. Override with
    // LOG_LEVEL=debug if you need them temporarily.
    const configured = (process.env.LOG_LEVEL || (APP_ENV === 'production' ? 'info' : 'debug')) as Level;
    const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
    return order[level] >= order[configured];
}

function serializeError(err: unknown): Record<string, unknown> | undefined {
    if (!err) return undefined;
    if (err instanceof Error) {
        return {
            name: err.name,
            message: err.message,
            stack: err.stack,
        };
    }
    return { value: String(err) };
}

function emit(level: Level, fields: LogFields, err?: unknown) {
    if (!shouldEmit(level)) return;

    // Additive Mongo transport — invisible unless LOG_PERSIST==='true'.
    persist(level, fields, err);

    const payload = {
        ts: new Date().toISOString(),
        level,
        service: SERVICE,
        env: APP_ENV,
        ...fields,
        ...(err ? { err: serializeError(err) } : {}),
    };

    const line = JSON.stringify(payload);
    if (level === 'error' || level === 'warn') {
        // Use stderr so log shippers can route errors separately.
        process.stderr.write(line + '\n');
    } else {
        process.stdout.write(line + '\n');
    }

    // Forward errors to Sentry. Best-effort — never throw from a logger.
    if (level === 'error') {
        try {
            if (err instanceof Error) {
                Sentry.captureException(err, { extra: fields });
            } else {
                Sentry.captureMessage(
                    typeof fields.event === 'string' ? fields.event : 'error',
                    { level: 'error', extra: { ...fields, err: serializeError(err) } },
                );
            }
        } catch {
            // ignore
        }
    }
}

export const logger = {
    debug: (fields: LogFields) => emit('debug', fields),
    info: (fields: LogFields) => emit('info', fields),
    warn: (fields: LogFields, err?: unknown) => emit('warn', fields, err),
    error: (fields: LogFields, err?: unknown) => emit('error', fields, err),
};
