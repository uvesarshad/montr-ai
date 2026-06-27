import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/mongodb';
import IntegrationConnection from '@/lib/db/models/integration-connection.model';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/**
 * Mailchimp webhook receiver.
 * GET/POST /api/webhooks/mailchimp/[connectionId]
 *
 * Mailchimp validates a webhook URL with a GET ping (we answer 200 { ok: true })
 * and then delivers events as application/x-www-form-urlencoded POSTs — never
 * JSON. Fields include `type` (subscribe|unsubscribe|profile|cleaned|upemail|
 * campaign) plus bracket-notation `data[...]` fields (data[email], data[list_id],
 * data[merges][FNAME], …).
 *
 * Mailchimp signs nothing, so verification is opt-in: if the connection's
 * `metadata.webhookSecret` is set, the `?secret=` query param must match
 * (timing-safe) → 401 otherwise. Without a configured secret the event is
 * accepted but flagged `verified: false` — consumers must treat it as untrusted.
 *
 * Events are published on the domain bus as `mailchimp.webhook_received`.
 */

function resolveSecret(connection: { metadata?: Record<string, unknown> }): string | null {
    const value = connection.metadata?.webhookSecret;
    return typeof value === 'string' ? value : null;
}

function checkSecret(expected: string, provided: string | null): boolean {
    if (provided === null) {
        return false;
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ connectionId: string }> }
) {
    try {
        const { connectionId } = await params;

        await connectDB();
        const connection = await IntegrationConnection.findById(connectionId);
        if (!connection || connection.provider !== 'mailchimp') {
            return NextResponse.json({ error: 'Unknown connection' }, { status: 404 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Mailchimp webhook (GET) error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ connectionId: string }> }
) {
    try {
        const { connectionId } = await params;

        await connectDB();
        const connection = await IntegrationConnection.findById(connectionId);
        if (!connection || connection.provider !== 'mailchimp') {
            return NextResponse.json({ error: 'Unknown connection' }, { status: 404 });
        }

        const expectedSecret = resolveSecret(connection);

        let verified = false;
        if (expectedSecret) {
            const provided = request.nextUrl.searchParams.get('secret');
            if (!checkSecret(expectedSecret, provided)) {
                return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
            }
            verified = true;
        }

        // Mailchimp posts urlencoded form data with bracket-notation keys.
        // Fold `data[x]` into a nested `data` object (one level deep); keep
        // deeper keys like `data[merges][FNAME]` as flat strings under data,
        // e.g. data['merges[FNAME]'].
        const form = await request.formData();
        let eventType: string | undefined;
        const data: Record<string, string> = {};

        for (const [key, value] of form.entries()) {
            const fieldValue = typeof value === 'string' ? value : '';
            if (key === 'type') {
                eventType = fieldValue;
                continue;
            }
            const match = key.match(/^data\[(.+?)\](.*)$/);
            if (match) {
                const innerKey = match[2] ? `${match[1]}${match[2]}` : match[1];
                data[innerKey] = fieldValue;
            }
        }

        publishDomainEvent({
            type: 'mailchimp.webhook_received',
            brandId: connection.brandId || undefined,
            source: 'webhooks.mailchimp',
            payload: {
                connectionId,
                verified,
                eventType,
                data,
            },
        });

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Mailchimp webhook (POST) error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
