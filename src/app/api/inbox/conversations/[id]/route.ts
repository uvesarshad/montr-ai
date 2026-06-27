import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { inboxService } from '@/lib/inbox/inbox.service';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { knowledgeIngestionService } from '@/lib/knowledge-base/knowledge-ingestion.service';
import { Types } from 'mongoose';

/**
 * GET /api/inbox/conversations/[id]
 * Get conversation details with messages
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        const conversation = await InboxConversation.findOne({
            _id: new Types.ObjectId(params.id)
        })
            .populate('channelId')
            .populate('contactId')
            .populate('assignedToId');

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        const messages = await inboxService.getMessages({
            conversationId: conversation._id,
        });

        return NextResponse.json({ conversation, messages });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * PATCH /api/inbox/conversations/[id]
 * Update conversation (status, assignee, priority, labels)
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { status, assignedToId, priority, labels, internalNotes } = body;

        const updates: Record<string, unknown> = {};
        if (status) updates.status = status;
        if (priority) updates.priority = priority;
        if (labels) updates.labels = labels;
        if (internalNotes !== undefined) updates.internalNotes = internalNotes;

        // Handle assignment separately to track who assigned it
        if (typeof assignedToId === 'string' && assignedToId) {
            const conversation = await inboxService.assignConversation({
                conversationId: new Types.ObjectId(params.id),
                assignedToId: new Types.ObjectId(assignedToId),
                assignedById: new Types.ObjectId(session.user.id!),
            });
            return NextResponse.json({ conversation });
        }

        if (assignedToId === null) {
            updates.assignedToId = null;
            updates.assignedById = null;
            updates.assignedAt = null;
        }

        const conversation = await InboxConversation.findOneAndUpdate(
            {
                _id: new Types.ObjectId(params.id)
            },
            updates,
            { new: true }
        )
            .populate('channelId')
            .populate('contactId')
            .populate('assignedToId');

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        // Background sync to Knowledge Base (Non-blocking) when a ticket is resolved
        if (status === 'resolved') {
            const contactName = conversation.contactId?.name || conversation.contactId?.phone || 'Unknown Customer';
            const messages = await inboxService.getMessages({ conversationId: conversation._id });

            // Format transcript of last 10 messages for context
            const recentMessages = messages.slice(-10).map(m => `${m.direction.toUpperCase()}: ${m.content}`).join('\n');
            const summaryText = `Internal Notes: ${conversation.internalNotes || 'None'}\n\nTranscript Snippet:\n${recentMessages}`;

            knowledgeIngestionService.ingestResolvedInboxThread(
                session.user.id,
                conversation._id.toString(),
                contactName,
                summaryText
            ).catch(e => console.error('Knowledge Base ingestion failed:', e));
        }

        return NextResponse.json({ conversation });
    } catch (error) {
        console.error('Error updating conversation:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
