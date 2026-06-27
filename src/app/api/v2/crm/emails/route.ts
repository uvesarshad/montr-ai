import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { emailRepository } from '@/lib/db/repository/crm/email.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

// GET /api/v2/crm/emails - List emails with filters and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    // Get user's organizationId
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const sort = searchParams.get('sort') || 'date';
    const sortDirection = (searchParams.get('sortDirection') || 'desc') as 'asc' | 'desc';

    // Filters
    const accountId = searchParams.get('accountId') || undefined;
    const folder = searchParams.get('folder') || undefined;
    const threadId = searchParams.get('threadId') || undefined;
    const contactId = searchParams.get('contactId') || undefined;
    const companyId = searchParams.get('companyId') || undefined;
    const dealId = searchParams.get('dealId') || undefined;
    const direction = searchParams.get('direction') as 'inbound' | 'outbound' | undefined;
    const isRead = searchParams.get('isRead') ? searchParams.get('isRead') === 'true' : undefined;
    const isStarred = searchParams.get('isStarred') ? searchParams.get('isStarred') === 'true' : undefined;
    const search = searchParams.get('search') || undefined;
    const dateAfter = searchParams.get('dateAfter') ? new Date(searchParams.get('dateAfter')!) : undefined;
    const dateBefore = searchParams.get('dateBefore') ? new Date(searchParams.get('dateBefore')!) : undefined;

    const result = await emailRepository.find(
      {
        accountId,
        folder,
        threadId,
        contactId,
        companyId,
        dealId,
        direction,
        isRead,
        isStarred,
        search,
        dateAfter,
        dateBefore,
      },
      { page, limit, sort, sortDirection }
    );

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}
