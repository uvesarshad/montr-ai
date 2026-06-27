import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { conversationRepository } from '@/lib/db/repository/conversation.repository';
import { z } from 'zod';

// Validation schemas
const createConversationSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        model: z.string().optional(),
        timestamp: z.string().or(z.date()).optional(),
    })).optional(),
    lastModel: z.string().optional(),
    lastModelRouteHint: z.object({
        sdk: z.string(),
        provider: z.string(),
        keySource: z.string(),
    }).optional(),
    type: z.enum(['text', 'image', 'video', 'audio', 'character']).optional(),
});

/**
 * GET /api/v2/conversations
 * Get all conversations for the authenticated user
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || undefined;
        const archived = searchParams.get('archived') === 'true' ? true :
            searchParams.get('archived') === 'false' ? false : undefined;
        const type = searchParams.get('type') || undefined;
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
        const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

        const conversations = await conversationRepository.findByUserId(
            userId,
            { search, archived, limit, offset, type },
            firebaseUid
        );

        // Return without full messages for list view (just metadata)
        const conversationList = conversations.map((conv) => {
            const convObj = conv.toObject ? conv.toObject() : conv;
            return {
                _id: convObj._id,
                title: convObj.title,
                lastMessage: convObj.lastMessage,
                lastModel: convObj.lastModel,
                isArchived: convObj.isArchived,
                messageCount: convObj.messages?.length || 0,
                createdAt: convObj.createdAt,
                updatedAt: convObj.updatedAt,
                type: convObj.type || 'text',
            };
        });

        return NextResponse.json({
            conversations: conversationList,
            count: conversationList.length,
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json(
            { error: 'Failed to fetch conversations', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

/**
 * POST /api/v2/conversations
 * Create a new conversation
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const body = await request.json();

        // Check plan limit BEFORE creating conversation
        const { checkPlanLimit } = await import('@/lib/plan-enforcement');
        const canCreate = await checkPlanLimit(userId, 'conversations', 'maxConversations');

        if (!canCreate.allowed) {
            return NextResponse.json({
                error: 'Plan limit reached',
                message: canCreate.message,
                current: canCreate.current,
                limit: canCreate.limit,
                upgradeRequired: true
            }, { status: 403 });
        }

        // Validate input
        const validatedData = createConversationSchema.parse(body);

        // Create conversation
        const conversation = await conversationRepository.create({
            userId,
            title: validatedData.title,
            messages: validatedData.messages?.map((m) => ({
                ...m,
                timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
            })),
            lastModel: validatedData.lastModel,
            lastModelRouteHint: validatedData.lastModelRouteHint,
            type: validatedData.type,
        });

        return NextResponse.json(conversation, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        console.error('Error creating conversation:', error);
        return NextResponse.json(
            { error: 'Failed to create conversation' },
            { status: 500 }
        );
    }
}
