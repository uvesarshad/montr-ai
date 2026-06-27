import { NextRequest, NextResponse } from 'next/server';
import { inboxService } from '@/lib/inbox/inbox.service';
import { Types } from 'mongoose';

/**
 * POST /api/webhooks/discord/[channelId]
 * Receive Discord messages
 */
export async function POST(req: NextRequest, props: { params: Promise<{ channelId: string }> }) {
    const params = await props.params;
    try {
        const payload = await req.json();

        // Discord sends interaction verification requests
        if (payload.type === 1) {
            return NextResponse.json({ type: 1 });
        }

        const result = await inboxService.receiveMessage({
            channelId: new Types.ObjectId(params.channelId),
            payload,
        });

        console.log('Discord message received:', {
            conversationId: result.conversation._id,
            messageId: result.message._id,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error processing Discord webhook:', error);
        return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 200 });
    }
}
