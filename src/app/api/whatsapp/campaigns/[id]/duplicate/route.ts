import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';

/**
 * Duplicate a campaign
 */
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    // Get original campaign
    const campaign = await whatsappCampaignRepository.findById(params.id);

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Verify campaign belongs to organization
    // Create duplicate campaign
    const duplicatedCampaign = await whatsappCampaignRepository.create({
      whatsappAccountId: campaign.whatsappAccountId.toString(),
      name: `${campaign.name} (Copy)`,
      targetType: campaign.targetType,
      targetGroups: campaign.targetGroups,
      targetContacts: campaign.targetContacts,
      targetFilter: campaign.targetFilter,
      messageType: campaign.messageType,
      templateId: campaign.templateId?.toString(),
      templateVariables: campaign.templateVariables,
      content: campaign.content,
      mediaUrl: campaign.mediaUrl,
      mediaType: campaign.mediaType,
      status: 'draft',
      timezone: campaign.timezone,
      batchSize: campaign.batchSize,
      botEnabled: campaign.botEnabled,
      createdBy: userId,
    });

    return NextResponse.json({
      message: 'Campaign duplicated successfully',
      data: duplicatedCampaign,
    });
  } catch (error) {
    console.error('Error duplicating campaign:', error);
    return NextResponse.json(
      { error: 'Failed to duplicate campaign', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
