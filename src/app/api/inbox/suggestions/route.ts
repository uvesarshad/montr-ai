import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { aiSuggestionsService } from '@/lib/inbox/ai-suggestions.service';
import { Types } from 'mongoose';

/**
 * GET /api/inbox/suggestions
 * Get AI-powered response suggestions for a conversation
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
            return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
        }

        const result = await aiSuggestionsService.generateSuggestions({
            conversationId: new Types.ObjectId(conversationId),
            numSuggestions: 3,
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error generating suggestions:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
