import { NextRequest, NextResponse } from 'next/server';
import { verifyMetaLeadsSignature, processMetaLeadgenEvent, MetaLeadgenValue } from '@/lib/ads/meta-leads';

/**
 * Meta Lead Ads webhook — configure on the Meta App as a Page subscription
 * with the `leadgen` field. Verify token: META_LEADS_WEBHOOK_VERIFY_TOKEN.
 */

// Verify Webhook (GET)
export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token) {
        const expectedToken = process.env.META_LEADS_WEBHOOK_VERIFY_TOKEN;

        if (expectedToken && token === expectedToken) {
            console.log('META_LEADS_WEBHOOK_VERIFIED');
            return new NextResponse(challenge, { status: 200 });
        }
        return new NextResponse('Forbidden', { status: 403 });
    }

    return new NextResponse('BadRequest', { status: 400 });
}

interface MetaLeadgenBody {
    object?: string;
    entry?: {
        id?: string; // page id
        changes?: {
            field?: string;
            value?: MetaLeadgenValue;
        }[];
    }[];
}

// Handle Events (POST)
export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const signature = req.headers.get('x-hub-signature-256');

        if (!verifyMetaLeadsSignature(rawBody, signature)) {
            return new NextResponse('Invalid signature', { status: 403 });
        }

        let body: MetaLeadgenBody;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return new NextResponse('Invalid JSON payload', { status: 400 });
        }

        if (body.object !== 'page') {
            return NextResponse.json({ received: true });
        }

        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field !== 'leadgen' || !change.value) continue;
                // processMetaLeadgenEvent never throws — every event is
                // handled independently and errors are logged, because a
                // non-200 makes Meta retry (and eventually disable) the
                // entire subscription.
                await processMetaLeadgenEvent({
                    ...change.value,
                    page_id: change.value.page_id || entry.id,
                });
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Meta leads webhook error:', error);
        // Still 200 — never make Meta back off the subscription
        return NextResponse.json({ received: true });
    }
}
