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
    // Check if campaign is running
    if (campaign.status !== 'running') {
      return NextResponse.json(
        { error: 'Campaign is not running' },
        { status: 400 }
      );
    }

    // Update campaign status to paused
    const updatedCampaign = await whatsappCampaignRepository.update(params.id, {
      status: 'paused',
    });

    // Note: Scheduled messages remain in the database with 'scheduled' status
    // The background job should check if the campaign is paused before sending

    return NextResponse.json({
      message: 'Campaign paused successfully',
      data: updatedCampaign,
    });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    return NextResponse.json(
      { error: 'Failed to pause campaign', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
