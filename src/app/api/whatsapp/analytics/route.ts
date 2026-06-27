import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAnalyticsService } from '@/lib/services/whatsapp-analytics.service';

/**
 * GET /api/whatsapp/analytics
 * Get WhatsApp analytics metrics
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const accountId = searchParams.get('accountId') || undefined;
        const period = searchParams.get('period') || '30d';

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();

        switch (period) {
            case '7d':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(startDate.getDate() - 90);
                break;
            default:
                startDate.setDate(startDate.getDate() - 30);
        }

        const analytics = await whatsappAnalyticsService.getAnalytics(
            session.user.id,
            accountId,
            startDate,
            endDate
        );

        return NextResponse.json({ analytics, period, startDate, endDate });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics' },
            { status: 500 }
        );
    }
}
