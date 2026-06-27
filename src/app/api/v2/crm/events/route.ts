import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { calendarEventRepository } from '@/lib/db/repository/crm/calendar-event.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

// GET /api/v2/crm/events - List calendar events with filters and pagination
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
    const limit = parseInt(searchParams.get('limit') || '50');
    const sort = searchParams.get('sort') || 'startTime';
    const sortDirection = (searchParams.get('sortDirection') || 'asc') as 'asc' | 'desc';

    // Filters
    const accountId = searchParams.get('accountId') || undefined;
    const calendarId = searchParams.get('calendarId') || undefined;
    const contactIds = searchParams.get('contactIds')?.split(',') || undefined;
    const companyId = searchParams.get('companyId') || undefined;
    const dealId = searchParams.get('dealId') || undefined;
    const status = searchParams.get('status') as 'confirmed' | 'tentative' | 'cancelled' | undefined;
    const startAfter = searchParams.get('startAfter') ? new Date(searchParams.get('startAfter')!) : undefined;
    const startBefore = searchParams.get('startBefore') ? new Date(searchParams.get('startBefore')!) : undefined;

    const result = await calendarEventRepository.find(
      {
        accountId,
        calendarId,
        contactIds,
        companyId,
        dealId,
        status,
        startAfter,
        startBefore,
      },
      { page, limit, sort, sortDirection }
    );

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching calendar events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 500 }
    );
  }
}

// POST /api/v2/crm/events - Create calendar event
export async function POST(request: NextRequest) {
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
    const {
      accountId,
      calendarId,
      title,
      description,
      location,
      meetingLink,
      startTime,
      endTime,
      timezone,
      isAllDay,
      attendees,
      contactIds,
      companyId,
      dealId,
      reminders,
    } = body;

    // Validate required fields
    if (!accountId || !calendarId || !title || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Account ID, calendar ID, title, start time, and end time are required' },
        { status: 400 }
      );
    }

    // Create event
    const event = await calendarEventRepository.create({
      accountId,
      eventId: `local-${Date.now()}`, // Temporary ID until synced
      calendarId,
      title,
      description,
      location,
      meetingLink,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      timezone,
      isAllDay,
      attendees,
      contactIds,
      companyId,
      dealId,
      reminders,
    });

    return NextResponse.json({
      data: event,
      message: 'Event created successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}
