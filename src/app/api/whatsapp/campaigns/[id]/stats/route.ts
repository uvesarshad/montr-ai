import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const campaign = await whatsappCampaignRepository.findById(params.id);

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Verify campaign belongs to organization
    // Get message statistics for this campaign
    const stats = await whatsappMessageRepository.getCampaignStats(params.id);

    // Calculate additional metrics
    const deliveryRate = stats.total > 0 ? (stats.delivered / stats.total) * 100 : 0;
    const readRate = stats.total > 0 ? (stats.read / stats.total) * 100 : 0;
    const failureRate = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;

    // Calculate estimated completion time
    let estimatedCompletionAt = null;
    if (campaign.status === 'running' && stats.total > 0) {
      const progress = stats.sent / stats.total;
      if (progress > 0 && campaign.startedAt) {
        const elapsedTime = Date.now() - campaign.startedAt.getTime();
        const estimatedTotalTime = elapsedTime / progress;
        const remainingTime = estimatedTotalTime - elapsedTime;
        estimatedCompletionAt = new Date(Date.now() + remainingTime);
      }
    }

    return NextResponse.json({
      data: {
        campaign: {
          id: campaign._id,
          name: campaign.name,
          status: campaign.status,
          startedAt: campaign.startedAt,
          completedAt: campaign.completedAt,
          totalRecipients: campaign.totalContacts,
        },
        messages: {
          total: stats.total,
          scheduled: stats.total - stats.sent - stats.failed,
          sent: stats.sent,
          delivered: stats.delivered,
          read: stats.read,
          failed: stats.failed,
        },
        rates: {
          delivery: deliveryRate.toFixed(2),
          read: readRate.toFixed(2),
          failure: failureRate.toFixed(2),
        },
        estimatedCompletionAt,
      },
    });
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign stats', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
