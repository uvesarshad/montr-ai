import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAnalyticsService, AnalyticsMetrics } from '@/lib/services/whatsapp-analytics.service';

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || '30d';
        const format = searchParams.get('format') || 'csv';
        const accountId = searchParams.get('accountId') || undefined;

        // Get analytics data
        const analytics = await whatsappAnalyticsService.getAnalytics(
            session.user.id,
            period as '7d' | '30d' | '90d',
            // @ts-expect-error
            accountId
        );

        if (format === 'json') {
            // Return JSON
            const jsonData = JSON.stringify(analytics, null, 2);
            return new NextResponse(jsonData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="whatsapp_analytics_${period}.json"`,
                },
            });
        } else {
            // Return CSV
            const csvRows = [
                // Header
                ['Metric', 'Value'],
                ['Total Messages', analytics.totalMessages.total.toString()],
                ['Messages Sent', analytics.totalMessages.sent.toString()],
                ['Messages Received', analytics.totalMessages.received.toString()],
                ['Avg Response Time (min)', analytics.responseTime.average.toString()],
                ['Median Response Time (min)', analytics.responseTime.median.toString()],
                ['Active Campaigns', analytics.campaignPerformance.active.toString()],
                ['Completed Campaigns', analytics.campaignPerformance.completed.toString()],
                ['Total Campaigns', analytics.campaignPerformance.total.toString()],
                ['Avg Delivery Rate (%)', analytics.campaignPerformance.avgDeliveryRate.toString()],
                ['Avg Read Rate (%)', analytics.campaignPerformance.avgReadRate.toString()],
                ['', ''],
                ['Date', 'Inbound', 'Outbound'],
                ...analytics.conversationVolume.map((item: AnalyticsMetrics['conversationVolume'][number]) => [
                    item.date,
                    item.inbound.toString(),
                    item.outbound.toString(),
                ]),
                ['', ''],
                ['Template Name', 'Usage Count'],
                ...analytics.templateUsage.map((item: AnalyticsMetrics['templateUsage'][number]) => [
                    item.templateName,
                    item.count.toString(),
                ]),
            ];

            const csvContent = csvRows.map(row => row.join(',')).join('\n');

            return new NextResponse(csvContent, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="whatsapp_analytics_${period}.csv"`,
                },
            });
        }
    } catch (error) {
        console.error('Error exporting analytics:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to export analytics' },
            { status: 500 }
        );
    }
}
