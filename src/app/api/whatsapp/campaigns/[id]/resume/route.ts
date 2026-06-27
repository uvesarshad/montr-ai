import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
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
    // Check if campaign is paused
    if (campaign.status !== 'paused') {
      return NextResponse.json(
        { error: 'Campaign is not paused' },
        { status: 400 }
      );
    }

    // Update campaign status to running
    const updatedCampaign = await whatsappCampaignRepository.update(params.id, {
      status: 'running',
    });

    // Note: The background job will resume sending scheduled messages

    return NextResponse.json({
      message: 'Campaign resumed successfully',
      data: updatedCampaign,
    });
  } catch (error) {
    console.error('Error resuming campaign:', error);
    return NextResponse.json(
      { error: 'Failed to resume campaign', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
