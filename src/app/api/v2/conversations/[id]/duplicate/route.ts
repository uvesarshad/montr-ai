import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { conversationRepository } from '@/lib/db/repository/conversation.repository';

/**
 * POST /api/v2/conversations/[id]/duplicate
 * Duplicate a conversation
 */
export async function POST(
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

        const duplicated = await conversationRepository.duplicate(id, userId, firebaseUid);

        if (!duplicated) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        return NextResponse.json(duplicated, { status: 201 });
    } catch (error) {
        console.error('Error duplicating conversation:', error);
        return NextResponse.json(
            { error: 'Failed to duplicate conversation' },
            { status: 500 }
        );
    }
}
