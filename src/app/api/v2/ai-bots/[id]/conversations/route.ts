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
 * GET /api/v2/ai-bots/[id]/conversations
 * List all visitor sessions for a website chatbot, with the last message preview.
 * Supports ?page=1&limit=25&status=open|closed
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
        const page = Math.max(1, Number(searchParams.get('page') ?? 1));
        const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 25)));
        const status = searchParams.get('status');

        const channel = await InboxChannel.findOne({
            _id: new Types.ObjectId(params.id),
            channelType: 'website',
        });

        if (!channel) {
            return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
        }

        const filter: Record<string, unknown> = {
            channelId: channel._id
        };
        if (status) filter.status = status;

        const total = await InboxConversation.countDocuments(filter);
        const conversations = await InboxConversation.find(filter)
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Attach last message preview for each conversation
        const conversationIds = conversations.map((c) => c._id);
        const lastMessages = await InboxMessage.aggregate([
            { $match: { conversationId: { $in: conversationIds }, isNote: false } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$conversationId',
                    content: { $first: '$content' },
                    direction: { $first: '$direction' },
                    createdAt: { $first: '$createdAt' },
                },
            },
        ]);

        const lastMessageMap = new Map(
            lastMessages.map((m) => [String(m._id), m]),
        );

        const enriched = conversations.map((c) => ({
            ...c,
            lastMessage: lastMessageMap.get(String((c as { _id: unknown })._id)) ?? null,
        }));

        return NextResponse.json({
            data: enriched,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page * limit < total,
            },
        });
    } catch (error) {
        console.error('Error fetching bot conversations:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
