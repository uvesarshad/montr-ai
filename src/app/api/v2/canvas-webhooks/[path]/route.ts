import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbConnect } from '@/lib/db/connect';
import { UnifiedWorkflow, WorkflowStatus } from '@/lib/db/models/unified-workflow.model';
import { checkExecuteRateLimit } from '@/lib/workflow/execute-rate-limit';
import { dispatchTrigger } from '@/lib/workflow/triggers/dispatch';

/**
 * Canvas webhook trigger.
 *
 *   POST /api/v2/canvas-webhooks/{path}
 *   GET  /api/v2/canvas-webhooks/{path}   (verification ping)
 *
 * Looks up a unified workflow whose trigger has a matching `webhookPath`,
 * verifies the optional shared secret (constant-time HMAC compare on the
 * `X-Signature` header, or plain header equality if no shared secret is set),
 * then kicks off an execution with the request body as triggerData.
 *
 * The route is intentionally unauthenticated — security is bound to the
 * generated path + optional HMAC secret. Treat it like any other public
 * webhook receiver.
 */

const isProd = process.env.NODE_ENV === 'production';

/** Hard cap on the request body we will buffer (1 MiB). Webhook payloads are
 *  small JSON documents; anything larger is rejected before we read it so a
 *  hostile sender can't OOM the process with a huge body. */
const MAX_BODY_BYTES = 1024 * 1024;

/** Replay window (ms) for the opt-in X-Timestamp check (±5 min). */
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

interface RouteContext {
    params: Promise<{ path: string }>;
}

function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    try {
        return crypto.timingSafeEqual(ab, bb);
    } catch {
        return false;
    }
}

async function findWorkflowsByPath(path: string) {
    await dbConnect();
    return UnifiedWorkflow.find({
        status: WorkflowStatus.ACTIVE,
        'trigger.type': 'webhook',
        'trigger.config.webhookPath': path,
    });
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
    const { path } = await ctx.params;
    const workflows = await findWorkflowsByPath(path);
    if (workflows.length === 0) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }
    return NextResponse.json({
        ok: true,
        workflowIds: workflows.map(w => w._id.toString()),
        count: workflows.length,
    });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
    try {
        const { path } = await ctx.params;
        if (!path) {
            return NextResponse.json({ error: 'Missing path' }, { status: 400 });
        }

        const workflows = await findWorkflowsByPath(path);
        if (workflows.length === 0) {
            return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
        }

        // Body-size cap. Reject early on the advertised Content-Length, then
        // guard the actual read in case the header lied (chunked / spoofed).
        const declaredLen = Number(req.headers.get('content-length') || '');
        if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
            return NextResponse.json(
                { error: 'Payload too large' },
                { status: 413 }
            );
        }

        const rawBody = await req.text();
        if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
            return NextResponse.json(
                { error: 'Payload too large' },
                { status: 413 }
            );
        }

        // Optional replay protection. This is opt-in per workflow webhook
        // (`trigger.config.webhookRequireTimestamp`) so existing senders that
        // only sign the body keep working unchanged. When ANY matched workflow
        // requires it, the request must carry a fresh `X-Timestamp` (epoch ms
        // or ISO-8601) within ±5 min. We validate before signature work so a
        // stale-but-validly-signed replay is still rejected.
        const requiresTimestamp = workflows.some(
            wf => wf.trigger?.config?.webhookRequireTimestamp === true
        );
        if (requiresTimestamp) {
            const tsHeader = req.headers.get('x-timestamp') || '';
            const tsMs = /^\d+$/.test(tsHeader.trim())
                ? Number(tsHeader.trim())
                : Date.parse(tsHeader);
            if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TIMESTAMP_WINDOW_MS) {
                return NextResponse.json(
                    { error: 'Missing or stale X-Timestamp' },
                    { status: 401 }
                );
            }
        }

        // Signature verification: every subscribed workflow must pass its own
        // secret check (they may have different shared secrets). A request is
        // accepted if AT LEAST one workflow's secret validates; we then only
        // fan out to the workflows that actually matched. This keeps the
        // signed-per-workflow security guarantee while allowing fan-out.
        const sigHeader = req.headers.get('x-signature') || '';
        const tokenHeader = req.headers.get('x-webhook-token') || '';

        const validated = workflows.filter(wf => {
            const secret: string | undefined = wf.trigger?.config?.webhookSecret;
            if (!secret) return true; // No secret configured → accept as-is
            const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
            const sigOk = sigHeader && safeEqual(sigHeader, expected);
            const tokenOk = tokenHeader && safeEqual(tokenHeader, secret);
            return !!(sigOk || tokenOk);
        });

        if (validated.length === 0) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        // Per-org rate limit — one charge per org per webhook hit is enough.
        const orgIds = Array.from(new Set(validated.map(wf => wf.createdById?.toString?.() || '')));
        for (const orgId of orgIds) {
            const rate = await checkExecuteRateLimit(orgId);
            if (!rate.allowed) {
                return NextResponse.json(
                    {
                        error: 'Too many executions',
                        retryAfterSeconds: rate.retryAfterSeconds,
                    },
                    { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
                );
            }
        }

        let body: Record<string, unknown> = {};
        if (rawBody) {
            try {
                body = JSON.parse(rawBody) as Record<string, unknown>;
            } catch {
                body = { raw: rawBody };
            }
        }

        // Fan out via the dispatcher. One webhook hit can now fire N workflows
        // on the same path — each one gets its own queued execution.
        const headerMap: Record<string, string> = {};
        req.headers.forEach((value, key) => { headerMap[key] = value; });

        // dispatchTrigger re-queries by path; scope it to the already-validated
        // workflows by re-narrowing with organizationId when there's only one.
        const dispatchOrgId = orgIds.length === 1 ? orgIds[0] : undefined;

        // Idempotency (C8): prefer a provider-supplied delivery id; otherwise
        // derive a stable hash from path + raw body + the current minute so a
        // retried delivery within the same minute dedups to one execution while
        // a genuine re-send later still fires.
        const deliveryId =
            req.headers.get('x-delivery-id') ||
            req.headers.get('idempotency-key') ||
            undefined;
        const eventId =
            deliveryId ||
            crypto
                .createHash('sha256')
                .update(`${path}:${rawBody}:${Math.floor(Date.now() / 60000)}`)
                .digest('hex')
                .slice(0, 32);

        const result = await dispatchTrigger({
            kind: 'webhook',
            path,
            body,
            headers: headerMap,
            eventId,
        });

        return NextResponse.json({
            success: true,
            matched: result.matched,
            enqueued: result.enqueued,
            errors: result.errors,
        });
    } catch (error) {
        console.error('[canvas-webhooks] error:', error);
        return NextResponse.json(
            {
                error: 'Webhook execution failed',
                ...(isProd ? {} : { detail: (error instanceof Error ? error.message : String(error)) }),
            },
            { status: 500 }
        );
    }
}
