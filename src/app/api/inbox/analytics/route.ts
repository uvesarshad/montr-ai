import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { buildInboxAnalytics } from '@/lib/inbox/inbox-insights';

/**
 * GET /api/inbox/analytics
 * Get inbox analytics and metrics
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = searchParams.get('endDate') || new Date().toISOString();
        const [conversations, channels] = await Promise.all([
            InboxConversation.find({
                createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
            }),
            InboxChannel.find({ }),
        ]);

        const analytics = buildInboxAnalytics({
            conversations: conversations.map((conversation) => ({
                status: conversation.status,
                createdAt: conversation.createdAt,
                channelId: conversation.channelId,
                assignedToId: conversation.assignedToId,
                firstResponseTime: conversation.firstResponseTime,
                averageResponseTime: conversation.averageResponseTime,
                csatRating: conversation.csatRating,
            })),
            channels: channels.map((channel) => ({
                _id: channel._id,
                channelType: channel.channelType,
            })),
        });

        return NextResponse.json(analytics);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
