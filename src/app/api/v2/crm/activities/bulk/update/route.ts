import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertBulkCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { updateActivitySchema } from '@/validations/crm/activity.schema';
import { z } from 'zod';

const bulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  updates: updateActivitySchema,
});

/**
 * PATCH /api/v2/crm/activities/bulk/update
 * Bulk update activities
 */
export async function PATCH(request: NextRequest) {
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
    assertBulkCrmPermission(ctx, 'activity', 'update');
    const body = await request.json();

    // Convert date strings to Date objects in updates
    if (body.updates?.dueDate) body.updates.dueDate = new Date(body.updates.dueDate);
    if (body.updates?.reminderAt) body.updates.reminderAt = new Date(body.updates.reminderAt);
    if (body.updates?.startTime) body.updates.startTime = new Date(body.updates.startTime);
    if (body.updates?.endTime) body.updates.endTime = new Date(body.updates.endTime);
    if (body.updates?.completedAt) body.updates.completedAt = new Date(body.updates.completedAt);

    // Validate input
    const { ids, updates } = bulkUpdateSchema.parse(body);

    // Single updateMany. We no longer return the updated documents to the
    // caller — the previous per-id loop did, but at the cost of N+1 queries.
    // Callers that need the new state should refetch.
    const updatedCount = await activityRepository.bulkUpdate(
      ids,
      updates as Record<string, unknown>,
    );
    const failedCount = Math.max(0, ids.length - updatedCount);

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      failed: failedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error bulk updating activities:', error);
    return NextResponse.json(
      { error: 'Failed to bulk update activities', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
