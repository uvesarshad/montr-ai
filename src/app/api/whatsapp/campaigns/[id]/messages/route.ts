import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status'); // Filter by message status

    const campaign = await whatsappCampaignRepository.findById(params.id);

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Verify campaign belongs to organization
    // Build filter
    const filter: Record<string, unknown> = {
      campaignId: params.id,
    };

    if (status) {
      filter.status = status;
    }

    // Fetch messages with pagination
    const result = await whatsappMessageRepository.findPaginated(filter, {
      page,
      limit,
      sort: { createdAt: -1 }, // Most recent first
      populate: [
        { path: 'contactId', select: 'firstName lastName email phone' },
        { path: 'accountId', select: 'phoneNumber displayName' },
      ],
    });

    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error fetching campaign messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign messages', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
