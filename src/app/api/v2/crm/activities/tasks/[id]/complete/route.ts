import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { emitTaskCompleted } from '@/lib/crm';

/**
 * POST /api/v2/crm/activities/tasks/[id]/complete
 * Mark a task as complete
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

    // Mark task as complete
    const activity = await activityRepository.markComplete(
      params.id,
      userId
    );

    if (!activity) {
      return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
    }

    await emitTaskCompleted(activity, userId);

    return NextResponse.json(activity);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error completing task:', error);
    return NextResponse.json(
      { error: 'Failed to complete task', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
