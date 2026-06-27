import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import { Types } from 'mongoose';

interface SessionUser {
}

/**
 * GET /api/v2/ai-bots/[id]/stats
 * Aggregate metrics for a website chatbot over the last N days.
 * ?days=30
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await dbConnect();
        const session = await getSession();
        const user = session?.user as SessionUser | undefined;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const days = Math.min(90, Math.max(1, Number(searchParams.get('days') ?? 30)));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const channel = await InboxChannel.findOne({
            _id: new Types.ObjectId(params.id),
            channelType: 'website',
        });

        if (!channel) {
            return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
        }

        const [
            totalSessions,
            openSessions,
            totalMessages,
            outboundMessages,
            handoffConversations,
            csatAgg,
            dailyVolume,
        ] = await Promise.all([
            // Total sessions in window
            InboxConversation.countDocuments({
                channelId: channel._id,
                createdAt: { $gte: since },
            }),
            // Open (unresolved) sessions
            InboxConversation.countDocuments({
                channelId: channel._id,
                status: 'open',
                createdAt: { $gte: since },
            }),
            // Total messages
            InboxMessage.countDocuments({
                channelId: channel._id,
                isNote: false,
                createdAt: { $gte: since },
            }),
            // AI replies
            InboxMessage.countDocuments({
                channelId: channel._id,
                direction: 'outbound',
                isNote: false,
                createdAt: { $gte: since },
            }),
            // Conversations that ended in handoff
            InboxConversation.countDocuments({
                channelId: channel._id,
                assigneeId: { $exists: true },
                createdAt: { $gte: since },
            }),
            // CSAT average (stored as metadata.csatRating on conversations)
            InboxConversation.aggregate([
                {
                    $match: {
                        channelId: channel._id,
                        'metadata.csatRating': { $exists: true },
                        createdAt: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: null,
                        avg: { $avg: '$metadata.csatRating' },
                        count: { $sum: 1 },
                    },
                },
            ]),
            // Daily message volume
            InboxMessage.aggregate([
                {
                    $match: {
                        channelId: channel._id,
                        direction: 'inbound',
                        isNote: false,
                        createdAt: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
        ]);

        const csat = csatAgg[0] ?? null;
        const handoffRate = totalSessions > 0 ? Math.round((handoffConversations / totalSessions) * 100) : 0;

        return NextResponse.json({
            window: { days, since },
            sessions: {
                total: totalSessions,
                open: openSessions,
                resolved: totalSessions - openSessions,
            },
            messages: {
                total: totalMessages,
                inbound: totalMessages - outboundMessages,
                aiReplies: outboundMessages,
            },
            handoff: {
                count: handoffConversations,
                rate: handoffRate,
            },
            csat: csat
                ? { average: Math.round(csat.avg * 10) / 10, count: csat.count }
                : null,
            dailyVolume,
        });
    } catch (error) {
        console.error('Error fetching bot stats:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
