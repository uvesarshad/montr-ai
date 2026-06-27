import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';

/**
 * POST /api/v2/crm/activities/tasks/[id]/uncomplete
 * Mark a task as incomplete
 */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    assertCrmPermission(ctx, 'activity', 'update');

    // Check if activity exists and is a task
    const existing = await activityRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    if (existing.type !== 'task') {
      return NextResponse.json(
        { error: 'Activity is not a task' },
        { status: 400 }
      );
    }

    // Mark task as incomplete
    const activity = await activityRepository.markIncomplete(params.id);

    if (!activity) {
      return NextResponse.json({ error: 'Failed to uncomplete task' }, { status: 500 });
    }

    return NextResponse.json(activity);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error uncompleting task:', error);
    return NextResponse.json(
      { error: 'Failed to uncomplete task', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
