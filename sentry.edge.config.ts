import * as Sentry from '@sentry/nextjs';

const REDACT_KEY_RE = /password|secret|token|authorization|api[_-]?key|encryption|cookie|dsn/i;

/** Recursively redact sensitive keys in a plain object/array. Defensive — never throws. */
function redactDeep(value: unknown, depth = 0): void {
    if (!value || typeof value !== 'object' || depth > 6) return;
    for (const key of Object.keys(value as Record<string, unknown>)) {
        const v = (value as Record<string, unknown>)[key];
        if (REDACT_KEY_RE.test(key)) {
            (value as Record<string, unknown>)[key] = '[redacted]';
        } else if (v && typeof v === 'object') {
            redactDeep(v, depth + 1);
        }
    }
}

/** Scrub PII/secrets from an outgoing event. Never throws. */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
    try {
        const req = event.request;
        if (req) {
            delete req.cookies;
            if (req.headers) {
                for (const h of Object.keys(req.headers)) {
                    if (/authorization|cookie/i.test(h)) req.headers[h] = '[redacted]';
                }
            }
            if (req.data) redactDeep(req.data);
        }
        if (event.extra) redactDeep(event.extra);
    } catch {
        /* never throw from beforeSend */
    }
    return event;
}

Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // env-driven sample rate (1.0 is too costly for the free tier)
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    // Enable debug in development
    debug: process.env.NODE_ENV === 'development',

    // Set environment
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,

    // Never send default PII
    sendDefaultPii: false,

    beforeSend: scrubEvent,
});
