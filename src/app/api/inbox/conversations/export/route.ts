import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { Types } from 'mongoose';

/**
 * POST /api/inbox/conversations/export
 * Export conversations to CSV or JSON
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { format = 'csv', filters = {} } = body;

        // Build query
        const query: Record<string, unknown> = {
};

        if (filters.channelId) {
            query.channelId = new Types.ObjectId(filters.channelId);
        }
        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.startDate || filters.endDate) {
            const createdAtRange: { $gte?: Date; $lte?: Date } = {};
            if (filters.startDate) createdAtRange.$gte = new Date(filters.startDate);
            if (filters.endDate) createdAtRange.$lte = new Date(filters.endDate);
            query.createdAt = createdAtRange;
        }

        // Fetch conversations
        const conversations = await InboxConversation.find(query)
            .populate('channelId')
            .populate('contactId')
            .populate('assignedToId')
            .sort({ createdAt: -1 })
            .limit(10000); // Limit to prevent memory issues

        if (format === 'json') {
            // JSON export
            return NextResponse.json({
                conversations,
                exportedAt: new Date().toISOString(),
                totalCount: conversations.length,
            });
        } else {
            // CSV export
            const csvRows = [
                // Header
                [
                    'ID',
                    'Channel',
                    'Contact',
                    'Status',
                    'Priority',
                    'Assigned To',
                    'Total Messages',
                    'Created At',
                    'Last Message At',
                    'CSAT Rating',
                ].join(','),
            ];

            // Data rows
            conversations.forEach((conv) => {
                csvRows.push(
                    [
                        conv._id.toString(),
                        (conv.channelId as { name?: string })?.name || '',
                        (conv.contactId as { name?: string })?.name || '',
                        conv.status,
                        conv.priority,
                        (conv.assignedToId as { name?: string })?.name || 'Unassigned',
                        conv.totalMessages,
                        conv.createdAt.toISOString(),
                        conv.lastMessageAt?.toISOString() || '',
                        conv.csat?.rating || '',
                    ].join(',')
                );
            });

            const csv = csvRows.join('\n');

            return new NextResponse(csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="conversations-${Date.now()}.csv"`,
                },
            });
        }
    } catch (error) {
        console.error('Error exporting conversations:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
