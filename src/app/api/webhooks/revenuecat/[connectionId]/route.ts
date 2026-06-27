import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/mongodb';
import IntegrationConnection from '@/lib/db/models/integration-connection.model';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/**
 * RevenueCat webhook receiver.
 * POST /api/webhooks/revenuecat/[connectionId]
 *
 * RevenueCat sends an Authorization header whose value the user configures in
 * the RevenueCat dashboard. If the connection's metadata has `webhookSecret`,
 * the header must match (timing-safe); without one the event is accepted but
 * flagged `verified: false` — consumers must treat it as untrusted.
 *
 * Events (initial purchase, renewal, cancellation, billing issue, …) are
 * published on the domain bus as `revenuecat.webhook_received`.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ connectionId: string }> }
) {
    try {
        const { connectionId } = await params;

        await connectDB();
        const connection = await IntegrationConnection.findById(connectionId);
        if (!connection || connection.provider !== 'revenuecat') {
            return NextResponse.json({ error: 'Unknown connection' }, { status: 404 });
        }

        const expectedSecret =
            typeof connection.metadata?.webhookSecret === 'string'
                ? connection.metadata.webhookSecret
                : null;
        const authHeader = request.headers.get('authorization') || '';

        let verified = false;
        if (expectedSecret) {
            const a = Buffer.from(authHeader);
            const b = Buffer.from(expectedSecret);
            if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
                return NextResponse.json({ error: 'Invalid authorization' }, { status: 401 });
            }
            verified = true;
        }

        const body = (await request.json().catch(() => null)) as {
            event?: Record<string, unknown>;
            api_version?: string;
        } | null;
        if (!body?.event) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        publishDomainEvent({
            type: 'revenuecat.webhook_received',
            brandId: connection.brandId || undefined,
            source: 'webhooks.revenuecat',
            payload: {
                connectionId,
                verified,
                eventType: body.event.type,
                event: body.event,
                apiVersion: body.api_version,
            },
        });

        // Start any workflows listening on the integration_webhook trigger.
        // Only verified deliveries may start workflows — an unverified event
        // could be forged and must not drive automation.
        if (verified) {
            try {
                const { dispatchTrigger } = await import('@/lib/workflow/triggers/dispatch');
                await dispatchTrigger({
                    kind: 'integration_webhook',
                    provider: 'revenuecat',
                    brandId: connection.brandId || undefined,
                    connectionId,
                    topic: String(body.event.type || 'unknown'),
                    payload: { event: body.event },
                    // RevenueCat sends a stable event.id; reused on retries.
                    eventId:
                        typeof body.event.id === 'string' || typeof body.event.id === 'number'
                            ? String(body.event.id)
                            : undefined,
                });
            } catch (err) {
                console.error('[webhooks.revenuecat] trigger dispatch failed:', err);
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('RevenueCat webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
