import { NextRequest, NextResponse } from 'next/server';
import { inboxService } from '@/lib/inbox/inbox.service';
import { Types } from 'mongoose';

/**
 * POST /api/webhooks/facebook/[channelId]
 * Receive Facebook Messenger messages
 */
export async function POST(req: NextRequest, props: { params: Promise<{ channelId: string }> }) {
    const params = await props.params;
    try {
        const payload = await req.json();

        const result = await inboxService.receiveMessage({
            channelId: new Types.ObjectId(params.channelId),
            payload,
        });

        console.log('Facebook message received:', {
            conversationId: result.conversation._id,
            messageId: result.message._id,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error processing Facebook webhook:', error);
        return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 200 });
    }
}
