import { NextRequest, NextResponse } from 'next/server';
import { inboxService } from '@/lib/inbox/inbox.service';
import { Types } from 'mongoose';

/**
 * POST /api/webhooks/slack/[channelId]
 * Receive Slack events
 */
export async function POST(req: NextRequest, props: { params: Promise<{ channelId: string }> }) {
    const params = await props.params;
    try {
        const payload = await req.json();

        // Slack URL verification challenge
        if (payload.type === 'url_verification') {
            return NextResponse.json({ challenge: payload.challenge });
        }

        // Skip bot messages and other event types we don't care about
        if (payload.event?.bot_id || payload.event?.type !== 'message') {
            return NextResponse.json({ success: true });
        }

        const result = await inboxService.receiveMessage({
            channelId: new Types.ObjectId(params.channelId),
            payload,
        });

        console.log('Slack message received:', {
            conversationId: result.conversation._id,
            messageId: result.message._id,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error processing Slack webhook:', error);
        return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 200 });
    }
}
