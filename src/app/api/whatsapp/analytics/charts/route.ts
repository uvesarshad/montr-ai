import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';

/**
 * Get analytics chart data
 * GET /api/whatsapp/analytics/charts
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const range = searchParams.get('range') || '7d';

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch (range) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
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
        startDate.setDate(startDate.getDate() - 7);
    }

    // Build filter
    const filter: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: now },
    };

    if (accountId) {
      filter.accountId = accountId;
    }

    // Get messages grouped by date
    const messages = await whatsappMessageRepository.find(filter);

    // Group messages by date
    const timeSeriesMap = new Map<string, { date: string; sent: number; delivered: number; read: number; failed: number }>();
    const dateFormat = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    });

    // Initialize all dates in range
    const currentDate = new Date(startDate);
    while (currentDate <= now) {
      const dateKey = currentDate.toISOString().split('T')[0];
      timeSeriesMap.set(dateKey, {
        date: dateFormat.format(currentDate),
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Count messages by status for each date
    messages.forEach((msg) => {
      const dateKey = new Date(msg.createdAt).toISOString().split('T')[0];
      const dayData = timeSeriesMap.get(dateKey);

      if (dayData) {
        if (msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read') {
          dayData.sent++;
        }
        if (msg.status === 'delivered' || msg.status === 'read') {
          dayData.delivered++;
        }
        if (msg.status === 'read') {
          dayData.read++;
        }
        if (msg.status === 'failed') {
          dayData.failed++;
        }
      }
    });

    const timeSeries = Array.from(timeSeriesMap.values());

    // Get campaign performance data
    const campaignFilter: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: now },
    };

    if (accountId) {
      campaignFilter.accountId = accountId;
    }

    const campaigns = await whatsappCampaignRepository.find({
      ...campaignFilter,
      status: { $in: ['running', 'paused', 'completed'] },
    });

    const campaignData = campaigns
      .filter((c) => c.totalContacts > 0)
      .slice(0, 10) // Top 10 campaigns
      .map((campaign) => {
        const deliveryRate =
          campaign.totalContacts > 0
            // @ts-expect-error
            ? ((campaign.deliveredCount || 0) / campaign.totalContacts) * 100
            : 0;

        const readRate =
          // @ts-expect-error
          campaign.deliveredCount > 0
            // @ts-expect-error
            ? ((campaign.readCount || 0) / campaign.deliveredCount) * 100
            : 0;

        return {
          name: campaign.name.length > 20 ? campaign.name.substring(0, 20) + '...' : campaign.name,
          // @ts-expect-error
          sent: campaign.sentCount || 0,
          // @ts-expect-error
          delivered: campaign.deliveredCount || 0,
          // @ts-expect-error
          read: campaign.readCount || 0,
          deliveryRate: Math.round(deliveryRate * 10) / 10,
          readRate: Math.round(readRate * 10) / 10,
        };
      })
      .sort((a, b) => b.sent - a.sent);

    return NextResponse.json({
      data: {
        timeSeries,
        campaigns: campaignData,
        range,
        startDate,
        endDate: now,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics charts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics charts', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
