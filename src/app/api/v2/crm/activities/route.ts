import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { createActivitySchema } from '@/validations/crm/activity.schema';
import { emitActivityCreated } from '@/lib/crm';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';
import type { IEmailMetadata, IMessageMetadata, ICalendarMetadata } from '@/lib/db/models/crm/activity.model';

/**
 * GET /api/v2/crm/activities
 * List activities with pagination, filtering, search, and sorting
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'activity', 'read');

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const sortParam = searchParams.get('sort') || '-createdAt';

    // Determine sort field and direction
    const sortDirection = sortParam.startsWith('-') ? 'desc' : 'asc';
    const sort = sortParam.startsWith('-') ? sortParam.substring(1) : sortParam;

    // Parse filters
    const filters: Record<string, unknown> = {};

    const type = searchParams.get('type');
    if (type) {
      // Support comma-separated types
      filters.type = type.includes(',') ? type.split(',') : type;
    }

    const targetType = searchParams.get('targetType');
    if (targetType) {
      filters.targetType = targetType;
    }

    const targetId = searchParams.get('targetId');
    if (targetId) {
      filters.targetId = targetId;
    }

    const contactId = searchParams.get('contactId');
    if (contactId) {
      filters.contactId = contactId;
    }

    const companyId = searchParams.get('companyId');
    if (companyId) {
      filters.companyId = companyId;
    }

    const dealId = searchParams.get('dealId');
    if (dealId) {
      filters.dealId = dealId;
    }

    const assignedTo = searchParams.get('assignedTo');
    if (assignedTo) {
      filters.assignedTo = assignedTo;
    }

    // Own-scope read: restrict to activities assigned to the current user.
    if (scope === 'own') {
      filters.assignedTo = userId;
    }

    const createdById = searchParams.get('createdById');
    if (createdById) {
      filters.createdById = createdById;
    }

    const completed = searchParams.get('completed');
    if (completed !== null && completed !== undefined && completed !== '') {
      filters.completed = completed === 'true';
    }

    const createdAfter = searchParams.get('createdAfter');
    if (createdAfter) {
      filters.createdAfter = new Date(createdAfter);
    }

    const createdBefore = searchParams.get('createdBefore');
    if (createdBefore) {
      filters.createdBefore = new Date(createdBefore);
    }

    const dueAfter = searchParams.get('dueAfter');
    if (dueAfter) {
      filters.dueAfter = new Date(dueAfter);
    }

    const dueBefore = searchParams.get('dueBefore');
    if (dueBefore) {
      filters.dueBefore = new Date(dueBefore);
    }

    // Fetch activities with pagination
    const result = await activityRepository.find(filters, {
      page,
      limit,
      sort,
      sortDirection,
    });

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/activities
 * Create a new activity
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'activity', 'create');

    const body = await request.json();

    // Convert date strings to Date objects
    if (body.dueDate) body.dueDate = new Date(body.dueDate);
    if (body.reminderAt) body.reminderAt = new Date(body.reminderAt);
    if (body.startTime) body.startTime = new Date(body.startTime);
    if (body.endTime) body.endTime = new Date(body.endTime);

    // Validate input
    const validatedData = createActivitySchema.parse(body);

    // Create activity - explicitly map only the fields needed for CreateActivityDto
    const activity = await activityRepository.create({
      type: validatedData.type,
      subtype: validatedData.subtype,
      targetType: validatedData.targetType,
      targetId: validatedData.targetId,
      contactId: validatedData.contactId,
      companyId: validatedData.companyId,
      dealId: validatedData.dealId,
      subject: validatedData.subject,
      body: validatedData.body,
      bodyPlain: validatedData.bodyPlain,
      dueDate: validatedData.dueDate,
      reminderAt: validatedData.reminderAt,
      priority: validatedData.priority,
      startTime: validatedData.startTime,
      endTime: validatedData.endTime,
      duration: validatedData.duration,
      location: validatedData.location,
      meetingLink: validatedData.meetingLink,
      attendees: validatedData.attendees,
      outcome: validatedData.outcome,
      emailMetadata: validatedData.emailMetadata as unknown as IEmailMetadata | undefined,
      messageMetadata: validatedData.messageMetadata as unknown as IMessageMetadata | undefined,
      calendarMetadata: validatedData.calendarMetadata as unknown as ICalendarMetadata | undefined,
      isPrivate: validatedData.isPrivate,
      isPinned: validatedData.isPinned,
      assignedTo: validatedData.assignedTo,
      createdById: userId,
    });

    await emitActivityCreated(activity, userId);

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating activity:', error);
    return NextResponse.json(
      { error: 'Failed to create activity', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
