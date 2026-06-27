import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const message = await whatsappMessageRepository.findById(params.id);

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    // Verify message belongs to organization
    // Populate related data
    await message.populate([
      { path: 'contactId', select: 'firstName lastName email phone' },
      { path: 'accountId', select: 'phoneNumber phoneNumberId displayName' },
      { path: 'sentBy', select: 'name email' },
    ]);

    return NextResponse.json({ data: message });
  } catch (error) {
    console.error('Error fetching message:', error);
    return NextResponse.json(
      { error: 'Failed to fetch message', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
