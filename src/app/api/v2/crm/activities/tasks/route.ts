import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';

/**
 * GET /api/v2/crm/activities/tasks
 * List tasks with filtering for completed and overdue tasks
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
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const sortParam = searchParams.get('sort') || 'dueDate';

    // Determine sort field and direction
    const sortDirection = sortParam.startsWith('-') ? 'desc' : 'asc';
    const sort = sortParam.startsWith('-') ? sortParam.substring(1) : sortParam;

    // Parse filters specific to tasks
    const filters: Record<string, unknown> = {};

    const { scope } = assertCrmPermission(await getCrmPermissionContext(userId), 'activity', 'read');

    const assignedTo = searchParams.get('assignedTo');
    if (assignedTo) {
      filters.assignedTo = assignedTo;
    }

    if (scope === 'own') {
      filters.assignedTo = userId;
    }

    const completed = searchParams.get('completed');
    if (completed !== null && completed !== undefined && completed !== '') {
      filters.completed = completed === 'true';
    }

    const overdue = searchParams.get('overdue');
    if (overdue === 'true') {
      filters.overdue = true;
    }

    // Fetch tasks with pagination
    const result = await activityRepository.findTasks(filters, {
      page,
      limit,
      sort,
      sortDirection,
    });

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
