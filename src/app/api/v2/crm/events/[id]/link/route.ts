import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { calendarEventRepository } from '@/lib/db/repository/crm/calendar-event.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

// POST /api/v2/crm/events/[id]/link - Link event to contact/company/deal
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'update');

    const body = await request.json();
    const { contactIds, companyId, dealId } = body;

    if (!contactIds && !companyId && !dealId) {
      return NextResponse.json(
        { error: 'At least one link (contactIds, companyId, or dealId) is required' },
        { status: 400 }
      );
    }

    const event = await calendarEventRepository.linkToEntity(params.id, {
      contactIds,
      companyId,
      dealId,
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: event,
      message: 'Event linked successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error linking event:', error);
    return NextResponse.json(
      { error: 'Failed to link event' },
      { status: 500 }
    );
  }
}
