import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { buildInboxConversationQuery } from '@/lib/inbox/inbox-insights';

/**
 * GET /api/inbox/conversations
 * List conversations with filters
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        const { searchParams } = new URL(req.url);
        const channelId = searchParams.get('channelId');
        const status = searchParams.get('status');
        const assignedToId = searchParams.get('assignedToId');
        const search = searchParams.get('search');
        const limit = parseInt(searchParams.get('limit') || '50');
        const skip = parseInt(searchParams.get('skip') || '0');

        const filter = buildInboxConversationQuery({
            channelId,
            status: status as 'open' | 'pending' | 'resolved' | 'closed' | null,
            assignedFilter: assignedToId === 'null' ? 'unassigned' : assignedToId,
            search,
        });

        const [conversations, total] = await Promise.all([
            InboxConversation.find(filter)
                .sort({ lastMessageAt: -1 })
                .limit(limit)
                .skip(skip)
                .populate('channelId')
                .populate('contactId')
                .populate('assignedToId'),
            InboxConversation.countDocuments(filter),
        ]);

        return NextResponse.json({ conversations, total });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
