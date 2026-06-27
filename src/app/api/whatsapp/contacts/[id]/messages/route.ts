import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
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
    const accountId = searchParams.get('accountId');
    const type = searchParams.get('type'); // Filter by message type
    const direction = searchParams.get('direction'); // inbound/outbound
    const status = searchParams.get('status');

    // Verify contact belongs to organization
    const contact = await contactRepository.findById(params.id);
    if (!contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Build filter
    const filter: Record<string, unknown> = {
      contactId: params.id,
    };

    if (accountId) {
      filter.accountId = accountId;
    }

    if (type) {
      filter.type = type;
    }

    if (direction) {
      filter.direction = direction;
    }

    if (status) {
      filter.status = status;
    }

    // Fetch messages with pagination
    const result = await whatsappMessageRepository.findPaginated(filter, {
      page,
      limit,
      sort: { createdAt: -1 }, // Most recent first
      populate: [
        { path: 'accountId', select: 'phoneNumber displayName' },
        { path: 'sentBy', select: 'name email' },
      ],
    });

    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
