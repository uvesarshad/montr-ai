import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { inboxService } from '@/lib/inbox/inbox.service';
import { Types } from 'mongoose';

/**
 * GET /api/inbox/messages
 * Get messages for a conversation
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get('conversationId');

        if (!conversationId) {
            return NextResponse.json(
                { error: 'conversationId is required' },
                { status: 400 }
            );
        }

        const messages = await inboxService.getMessages({
            conversationId: new Types.ObjectId(conversationId),
        });

        return NextResponse.json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * POST /api/inbox/messages
 * Send a message
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { conversationId, content, mediaUrl, mediaType, fileName, isNote, noteAuthorId } = body;

        if (!conversationId || !content) {
            return NextResponse.json(
                { error: 'conversationId and content are required' },
                { status: 400 }
            );
        }

        // If it's a note, create it directly
        if (isNote) {
            const conversation = await InboxConversation.findOne({
                _id: new Types.ObjectId(conversationId)
            });

            if (!conversation) {
                return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
            }

            const message = await inboxService.createMessage({
                conversationId: new Types.ObjectId(conversationId),
                channelId: conversation.channelId,
                contactId: conversation.contactId,
                direction: 'outbound',
                messageType: 'note',
                content,
                isNote: true,
                noteAuthorId: new Types.ObjectId(noteAuthorId || session.user.id),
                noteAuthorName: session.user.name || session.user.email || 'Agent',
                metadata: { source: 'inbox-note' },
            });
            return NextResponse.json({ message }, { status: 201 });
        }

        // Send message via channel adapter
        const message = await inboxService.sendMessage({
            conversationId: new Types.ObjectId(conversationId),
            content,
            mediaUrl,
            mediaType,
            fileName,
        });

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error('Error sending message:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
