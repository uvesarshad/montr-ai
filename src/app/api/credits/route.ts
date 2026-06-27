import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getUsageSummary } from '@/lib/credit-service';

/**
 * GET /api/credits
 * Get current user's credit usage
 */
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const usage = await getUsageSummary(session.user.id!);

        if (!usage) {
            // User has no credit allocation - return default values
            return NextResponse.json({
                totalAllocated: 0,
                totalUsed: 0,
                remaining: 0,
                usageByType: { text: 0, image: 0, video: 0, scraping: 0 },
                periodEnd: null,
                hasActiveSubscription: false,
            });
        }

        return NextResponse.json({
            ...usage,
            hasActiveSubscription: true,
        });
    } catch (error) {
        console.error('Error fetching credits:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
