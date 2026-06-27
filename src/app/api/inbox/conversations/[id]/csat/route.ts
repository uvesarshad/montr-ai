import { NextRequest, NextResponse } from 'next/server';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { Types } from 'mongoose';

/**
 * POST /api/inbox/conversations/[id]/csat
 * Submit CSAT rating for a conversation
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const body = await req.json();
        const { rating, feedback } = body;

        if (!rating || rating < 1 || rating > 5) {
            return NextResponse.json(
                { error: 'Rating must be between 1 and 5' },
                { status: 400 }
            );
        }

        const conversation = await InboxConversation.findByIdAndUpdate(
            new Types.ObjectId(params.id),
            {
                'csat.rating': rating,
                'csat.feedback': feedback || '',
                'csat.submittedAt': new Date(),
            },
            { new: true }
        );

        if (!conversation) {
            return NextResponse.json(
                { error: 'Conversation not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, conversation });
    } catch (error) {
        console.error('Error submitting CSAT:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * GET /api/inbox/conversations/[id]/csat
 * Get CSAT rating for a conversation
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const conversation = await InboxConversation.findById(
            new Types.ObjectId(params.id)
        ).select('csat');

        if (!conversation) {
            return NextResponse.json(
                { error: 'Conversation not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ csat: conversation.csat });
    } catch (error) {
        console.error('Error fetching CSAT:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
