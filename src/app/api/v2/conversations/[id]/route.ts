import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { conversationRepository } from '@/lib/db/repository/conversation.repository';
import type { IMessage } from '@/lib/db/models/conversation.model';
import { knowledgeIngestionService } from '@/lib/knowledge-base/knowledge-ingestion.service';
import { z } from 'zod';

// Validation schema for updates
const updateConversationSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    lastMessage: z.string().optional(),
    lastModel: z.string().optional(),
    lastModelRouteHint: z.object({
        sdk: z.string(),
        provider: z.string(),
        keySource: z.string(),
    }).nullable().optional(),
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        model: z.string().optional(),
        timestamp: z.string().or(z.date()).optional(),
    })).optional(),
    conversationSummary: z.string().optional(),
    lastSummarizedIndex: z.number().optional(),
    isArchived: z.boolean().optional(),
});

/**
 * GET /api/v2/conversations/[id]
 * Get a single conversation with all messages
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;
        const { id } = await params;

        const conversation = await conversationRepository.findById(id, userId, firebaseUid);

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        return NextResponse.json(conversation);
    } catch (error) {
        console.error('Error fetching conversation:', error);
        return NextResponse.json(
            { error: 'Failed to fetch conversation', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/v2/conversations/[id]
 * Update a conversation (title, messages, archive status, etc.)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;
        const { id } = await params;
        const body = await request.json();

        // Validate input
        const validatedData = updateConversationSchema.parse(body);

        // Process messages timestamps if provided
        const updateData: Record<string, unknown> = { ...validatedData };
        if (validatedData.messages) {
            updateData.messages = validatedData.messages.map((m) => ({
                ...m,
                timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
            }));
        }

        const conversation = await conversationRepository.update(
            id,
            userId,
            updateData,
            firebaseUid
        );

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        // Background sync to Knowledge Base (Non-blocking)
        // We only want to index reasonably long conversations to act as memory
        if (conversation.messages && conversation.messages.length >= 4) {
            knowledgeIngestionService.ingestCopilotConversation(
                userId,
                conversation._id.toString(),
                conversation.title || 'Untitled Chat',
                conversation.messages.map((m: IMessage) => ({ role: m.role, content: m.content }))
            ).catch(err => console.error('Knowledge Base ingestion failed:', err));
        }

        return NextResponse.json(conversation);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        console.error('Error updating conversation:', error);
        return NextResponse.json(
            { error: 'Failed to update conversation' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/v2/conversations/[id]
 * Delete a conversation
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;
        const { id } = await params;

        const deleted = await conversationRepository.delete(id, userId, firebaseUid);

        if (!deleted) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting conversation:', error);
        return NextResponse.json(
            { error: 'Failed to delete conversation' },
            { status: 500 }
        );
    }
}
