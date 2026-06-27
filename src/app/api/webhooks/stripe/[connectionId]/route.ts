import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { connectDB } from '@/lib/mongodb';
import IntegrationConnection from '@/lib/db/models/integration-connection.model';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/**
 * Stripe webhook receiver.
 * POST /api/webhooks/stripe/[connectionId]
 *
 * Webhook URL format (register this in the Stripe dashboard → Developers →
 * Webhooks, then paste the signing secret as the connection's webhookSecret):
 *   https://<your-domain>/api/webhooks/stripe/<connectionId>
 *
 * Verification:
 *   - Stripe signs each delivery with the `Stripe-Signature` header:
 *     `t=<unix>,v1=<hex>[,v1=<hex>...]`.
 *   - The signed payload is `${t}.${rawBody}`; v1 = HMAC-SHA256(hex) keyed by
 *     the endpoint's signing secret (`whsec_...`). Compared timing-safe.
 *   - A 5-minute timestamp tolerance guards against replay.
 *   - The signing secret is the connection's `webhookSecret` credential (stored
 *     encrypted at connect time). Without it the delivery is rejected (401) —
 *     revenue events are too high-value to accept unverified.
 *   - Implemented manually with `crypto` — the stripe SDK is NOT a dependency.
 *
 * Events (checkout.session.completed, invoice.paid, customer.subscription.*, …)
 * are published on the domain bus as `stripe.webhook_received` and fan out to
 * the integration_webhook trigger (topic = event.type, eventId = event.id).
 */

// Replay-protection window (Stripe's recommended default).
const TIMESTAMP_TOLERANCE_SEC = 5 * 60;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ connectionId: string }> }
) {
    try {
        const { connectionId } = await params;

        // Read the RAW body first — the HMAC is computed over the exact bytes.
        const rawBody = await request.text();

        await connectDB();
        // Load WITH credentials so we can read the webhook signing secret. The
        // org is needed for the org-scoped credential lookup; load the bare
        // connection first to discover its org.
        const bare = await IntegrationConnection.findById(connectionId);
        if (!bare || bare.provider !== 'stripe') {
            return NextResponse.json({ error: 'Unknown connection' }, { status: 404 });
        }

        const decrypted = await integrationConnectionRepository.findByIdWithCredentials(
            connectionId
        );
        const signingSecret =
            decrypted && typeof decrypted.credentials.webhookSecret === 'string'
                ? decrypted.credentials.webhookSecret
                : null;

        if (!signingSecret) {
            console.warn(
                `[webhooks.stripe] connection ${connectionId} has no webhookSecret — rejecting delivery.`
            );
            return NextResponse.json({ error: 'Webhook signing secret not configured' }, { status: 401 });
        }

        const sigHeader = request.headers.get('stripe-signature') || '';
        if (!verifyStripeSignature(rawBody, sigHeader, signingSecret)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const event = (await safeParseJson(rawBody)) as {
            id?: string;
            type?: string;
            data?: Record<string, unknown>;
        } | null;
        if (!event?.type) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        publishDomainEvent({
            type: 'stripe.webhook_received',
            brandId: bare.brandId || undefined,
            source: 'webhooks.stripe',
            payload: {
                connectionId,
                eventType: event.type,
                eventId: event.id,
                data: event.data,
            },
        });

        try {
            const { dispatchTrigger } = await import('@/lib/workflow/triggers/dispatch');
            await dispatchTrigger({
                kind: 'integration_webhook',
                provider: 'stripe',
                brandId: bare.brandId || undefined,
                connectionId,
                topic: String(event.type),
                payload: { event },
                // Stripe stamps each event with a stable id; reused on retries.
                eventId: typeof event.id === 'string' ? event.id : undefined,
            });
        } catch (err) {
            console.error('[webhooks.stripe] trigger dispatch failed:', err);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Verify a Stripe `Stripe-Signature` header against the raw body.
 * Header format: `t=<unix>,v1=<hex>[,v1=<hex>…]` (may also carry v0 schemes).
 * Computes HMAC-SHA256(`${t}.${rawBody}`) keyed by the signing secret and
 * timing-safe-compares it against every v1 signature present. Enforces a
 * 5-minute timestamp tolerance to defeat replay.
 */
function verifyStripeSignature(rawBody: string, header: string, secret: string): boolean {
    if (!header) return false;

    let timestamp: string | undefined;
    const v1Signatures: string[] = [];
    for (const part of header.split(',')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key === 't') timestamp = value;
        else if (key === 'v1') v1Signatures.push(value);
    }
    if (!timestamp || v1Signatures.length === 0) return false;

    // Replay guard.
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ts) > TIMESTAMP_TOLERANCE_SEC) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`, 'utf8')
        .digest('hex');

    return v1Signatures.some((sig) => timingSafeEqualHex(expected, sig));
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
