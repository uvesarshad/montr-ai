import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';

/**
 * GET /api/v2/crm/contacts/[id]/deals
 * Get all deals associated with a contact
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    assertCrmPermission(await getCrmPermissionContext(userId), 'deal', 'read');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    // Check if contact exists
    const contact = await contactRepository.findById(params.id);
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    // Fetch deals associated with this contact
    const deals = await dealRepository.findByContact(
      params.id,
      { page, limit }
    );

    return NextResponse.json(deals);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching contact deals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deals', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
