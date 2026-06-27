import { NextRequest, NextResponse } from 'next/server';
import { inboxService } from '@/lib/inbox/inbox.service';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { Types } from 'mongoose';

/**
 * GET /api/webhooks/instagram/[channelId]
 * Instagram webhook verification (Meta requirement)
 */
export async function GET(req: NextRequest, props: { params: Promise<{ channelId: string }> }) {
    const params = await props.params;
    try {
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get('hub.mode');
        const token = searchParams.get('hub.verify_token');
        const challenge = searchParams.get('hub.challenge');

        const channel = await InboxChannel.findById(new Types.ObjectId(params.channelId));

        if (!channel) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        const verifyToken = channel.config.webhookVerifyToken || 'montrai_webhook_token';

        if (mode === 'subscribe' && token === verifyToken) {
            console.log('Instagram webhook verified for channel:', params.channelId);
            return new NextResponse(challenge, { status: 200 });
        }

        return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
    } catch (error) {
        console.error('Error verifying Instagram webhook:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * POST /api/webhooks/instagram/[channelId]
 * Receive Instagram messages
 */
export async function POST(req: NextRequest, props: { params: Promise<{ channelId: string }> }) {
    const params = await props.params;
    try {
        const payload = await req.json();

        const result = await inboxService.receiveMessage({
            channelId: new Types.ObjectId(params.channelId),
            payload,
        });

        console.log('Instagram message received:', {
            conversationId: result.conversation._id,
            messageId: result.message._id,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error processing Instagram webhook:', error);
        return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 200 });
    }
}
