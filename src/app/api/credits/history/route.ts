import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getUsageHistory } from '@/lib/credit-service';

/**
 * GET /api/credits/history
 * Get current user's credit usage history
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');

        const history = await getUsageHistory(session.user.id!, Math.min(limit, 100));

        return NextResponse.json({ history });
    } catch (error) {
        console.error('Error fetching credit history:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
