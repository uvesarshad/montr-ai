import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { connectDB } from '@/lib/mongodb';
import IntegrationConnection from '@/lib/db/models/integration-connection.model';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/**
 * Calendly webhook receiver.
 * POST /api/webhooks/calendly/[connectionId]
 *
 * Webhook URL format (registered automatically at connect time — see
 * src/lib/integrations/server/calendly-webhooks.ts):
 *   https://<your-domain>/api/webhooks/calendly/<connectionId>
 *
 * Verification:
 *   - Calendly signs each delivery with the webhook subscription's signing key,
 *     sent in the `Calendly-Webhook-Signature` header as `t=<unix>,v1=<hex>`.
 *   - v1 = HMAC-SHA256(`${t}.${rawBody}`) keyed by the signing key, compared
 *     timing-safe. The signing key is stored on the connection metadata
 *     (`webhookSigningKey`) when the subscription is created.
 *   - If the connection has no signing key configured, the event is accepted but
 *     flagged `verified: false` (a warning is logged) and does NOT start
 *     workflows — an unverified event could be forged.
 *
 * Events (invitee.created — "meeting booked", invitee.canceled) are published on
 * the domain bus as `calendly.webhook_received` and fan out to the
 * integration_webhook trigger (topic = event type) when verified.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ connectionId: string }> }
) {
    try {
        const { connectionId } = await params;

        // Read the RAW body first — the HMAC is computed over the exact bytes.
        const rawBody = await request.text();

        await connectDB();
        const connection = await IntegrationConnection.findById(connectionId);
        if (!connection || connection.provider !== 'calendly') {
            return NextResponse.json({ error: 'Unknown connection' }, { status: 404 });
        }

        const signingKey =
            typeof connection.metadata?.webhookSigningKey === 'string'
                ? connection.metadata.webhookSigningKey
                : null;

        let verified = false;
        if (signingKey) {
            const sigHeader = request.headers.get('calendly-webhook-signature') || '';
            if (!verifyCalendlySignature(rawBody, sigHeader, signingKey)) {
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
            verified = true;
        } else {
            console.warn(
                `[webhooks.calendly] connection ${connectionId} has no webhookSigningKey configured — ` +
                    'accepting event as UNVERIFIED (will not start workflows).'
            );
        }

        const body = (await safeParseJson(rawBody)) as {
            event?: string;
            payload?: Record<string, unknown>;
        } | null;
        if (!body?.event) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // The invitee/event uri is the stable per-delivery identifier (Calendly
        // does not send a top-level delivery id). Fall back to the scheduled
        // event uri or a hash of the body.
        const payload = (body.payload || {}) as Record<string, unknown>;
        const inviteeUri = typeof payload.uri === 'string' ? payload.uri : undefined;
        const scheduledEventUri =
            payload.scheduled_event && typeof payload.scheduled_event === 'object'
                ? ((payload.scheduled_event as Record<string, unknown>).uri as string | undefined)
                : undefined;
        const eventId = inviteeUri || scheduledEventUri || undefined;

        publishDomainEvent({
            type: 'calendly.webhook_received',
            brandId: connection.brandId || undefined,
            source: 'webhooks.calendly',
            payload: {
                connectionId,
                verified,
                eventType: body.event,
                payload,
            },
        });

        // Only verified deliveries may start workflows — an unverified event could
        // be forged and must not drive automation.
        if (verified) {
            try {
                const { dispatchTrigger } = await import('@/lib/workflow/triggers/dispatch');
                await dispatchTrigger({
                    kind: 'integration_webhook',
                    provider: 'calendly',
                    brandId: connection.brandId || undefined,
                    connectionId,
                    topic: String(body.event),
                    payload,
                    eventId,
                });
            } catch (err) {
                console.error('[webhooks.calendly] trigger dispatch failed:', err);
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Calendly webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Verify a Calendly `Calendly-Webhook-Signature` header.
 * Format: `t=<unix-seconds>,v1=<hex-hmac>`.
 * v1 = HMAC-SHA256(`${t}.${rawBody}`) keyed by the signing key (hex digest).
 * Constant-time comparison; tolerates header ordering/whitespace.
 */
function verifyCalendlySignature(rawBody: string, header: string, signingKey: string): boolean {
    if (!header) return false;

    let timestamp: string | undefined;
    let signature: string | undefined;
    for (const part of header.split(',')) {
        const [key, value] = part.split('=');
        const k = key?.trim();
        const v = value?.trim();
        if (k === 't') timestamp = v;
        else if (k === 'v1') signature = v;
    }
    if (!timestamp || !signature) return false;

    const expected = crypto
        .createHmac('sha256', signingKey)
        .update(`${timestamp}.${rawBody}`, 'utf8')
        .digest('hex');

    return timingSafeEqualHex(expected, signature);
}

/** Constant-time hex comparison (guards length-leak + non-hex input). */
function timingSafeEqualHex(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

async function safeParseJson(raw: string): Promise<unknown> {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}
