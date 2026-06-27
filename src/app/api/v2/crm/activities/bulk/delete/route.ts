import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertBulkCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { z } from 'zod';

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

/**
 * POST /api/v2/crm/activities/bulk/delete
 * Bulk delete activities
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
    assertBulkCrmPermission(ctx, 'activity', 'delete');
    const body = await request.json();

    // Validate input
    const { ids } = bulkDeleteSchema.parse(body);

    // Soft-delete (move to trash) in a single updateMany.
    const deletedCount = await activityRepository.bulkSoftDelete(ids, userId);
    const failedCount = Math.max(0, ids.length - deletedCount);

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
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
    console.error('Error bulk deleting activities:', error);
    return NextResponse.json(
      { error: 'Failed to bulk delete activities', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
