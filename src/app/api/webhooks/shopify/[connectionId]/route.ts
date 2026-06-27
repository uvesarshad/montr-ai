import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import IntegrationConnection from '@/lib/db/models/integration-connection.model';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import { publishDomainEvent } from '@/lib/events/domain-bus';
import { connectDB } from '@/lib/mongodb';

/**
 * POST /api/webhooks/shopify/[connectionId]
 *
 * Inbound Shopify webhook receiver.
 *
 * Webhook URL format (register this in the Shopify app / store admin):
 *   https://<your-domain>/api/webhooks/shopify/<connectionId>
 *
 * Verification:
 *   - HMAC-SHA256 (base64) of the RAW request body, keyed by the app's client
 *     secret (process.env.SHOPIFY_CLIENT_SECRET), compared against the
 *     X-Shopify-Hmac-Sha256 header using a timing-safe comparison.
 *   - Missing secret or mismatch → 401. (Shopify only retries on non-2xx, so a
 *     bad HMAC is the only case where we intentionally return non-200.)
 *
 * Behavior:
 *   - Loads the IntegrationConnection by [connectionId] (no credentials needed —
 *     HMAC uses the app secret, not the connection's access token). 404 if absent.
 *   - app/uninstalled → flips the connection to status 'error'.
 *   - Every topic (including the mandatory GDPR compliance topics) publishes a
 *     'shopify.webhook_received' domain event for downstream consumers.
 *   - Responds 200 { received: true } on success.
 */
export async function POST(
    req: NextRequest,
    props: { params: Promise<{ connectionId: string }> }
) {
    const { connectionId } = await props.params;

    // 1. Read the RAW body first — HMAC is computed over the exact bytes.
    const rawBody = await req.text();

    // 2. Verify HMAC signature.
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');

    if (!secret || !hmacHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const computed = crypto
        .createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64');

    if (!timingSafeEqualStr(computed, hmacHeader)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    try {
        await connectDB();

        // 3. Load the connection (no credentials required for webhook handling).
        const connection = await IntegrationConnection.findById(connectionId);
        if (!connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const topic = req.headers.get('x-shopify-topic') || '';
        const shop = req.headers.get('x-shopify-shop-domain') || '';

        // 4. Parse the body (best-effort — verification already passed on raw bytes).
        let data: unknown = {};
        try {
            data = rawBody ? JSON.parse(rawBody) : {};
        } catch {
            data = { raw: rawBody };
        }

        // 5. App-uninstall → mark the connection errored so it stops being used.
        if (topic === 'app/uninstalled') {
            await integrationConnectionRepository.setStatus(
                String(connection._id),
                'error',
                'App uninstalled from the Shopify store.'
            );
        }

        // 6. Fan out a domain event for every topic (incl. GDPR compliance topics:
        //    customers/data_request, customers/redact, shop/redact — acknowledged
        //    here; actual handling is deferred and lives in subscribers).
        publishDomainEvent({
            type: 'shopify.webhook_received',
            brandId: connection.brandId || undefined,
            source: 'webhooks.shopify',
            payload: {
                connectionId,
                topic,
                shop,
                data,
            },
        });

        // 7. Start any workflows listening on the integration_webhook trigger.
        //    Failures must not block the 200 — Shopify would retry the delivery.
        try {
            const { dispatchTrigger } = await import('@/lib/workflow/triggers/dispatch');
            await dispatchTrigger({
                kind: 'integration_webhook',
                provider: 'shopify',
                brandId: connection.brandId || undefined,
                connectionId,
                topic,
                payload: { shop, data },
                // Shopify stamps each delivery with a unique id; reused on retries.
                eventId: req.headers.get('x-shopify-webhook-id') || undefined,
            });
        } catch (err) {
            console.error('[webhooks.shopify] trigger dispatch failed:', err);
        }

        return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
        // Non-2xx triggers Shopify retries; surface 500 so the event is retried.
        console.error('[webhooks.shopify] processing error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

/** Constant-time string comparison guarding against length-leak + type errors. */
function timingSafeEqualStr(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}
