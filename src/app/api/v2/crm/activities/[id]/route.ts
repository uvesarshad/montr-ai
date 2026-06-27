import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { updateActivitySchema } from '@/validations/crm/activity.schema';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';
import { getCrmPermissionContext, assertCrmPermission, ownsRecord, crmErrorResponse, CrmPermissionError } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * GET /api/v2/crm/activities/[id]
 * Get a single activity by ID
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const { scope } = assertCrmPermission(ctx, 'activity', 'read');

    const activity = await activityRepository.findById(params.id);

    if (!activity) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'activity', activity as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    return NextResponse.json(activity);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching activity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/activities/[id]
 * Update an activity
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const { scope } = assertCrmPermission(ctx, 'activity', 'update');

    const body = await request.json();

    // Convert date strings to Date objects
    if (body.dueDate) body.dueDate = new Date(body.dueDate);
    if (body.reminderAt) body.reminderAt = new Date(body.reminderAt);
    if (body.startTime) body.startTime = new Date(body.startTime);
    if (body.endTime) body.endTime = new Date(body.endTime);
    if (body.completedAt) body.completedAt = new Date(body.completedAt);

    // Validate input
    const validatedData = updateActivitySchema.parse(body);

    // Check if activity exists
    const existing = await activityRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'activity', existing as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to update this activity');
    }

    // Update activity
    const activity = await activityRepository.update(
      params.id,
      validatedData
    );

    if (!activity) {
      return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
    }

    return NextResponse.json(activity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating activity:', error);
    return NextResponse.json(
      { error: 'Failed to update activity', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/activities/[id]
 * Soft-delete an activity (moves to trash). `?permanent=true` hard-deletes —
 * admin / super_admin only.
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const role = (session.user as { role?: string }).role;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'activity', 'delete');

    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';

    if (permanent && role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Only admins can permanently delete records' }, { status: 403 });
    }

    // Check if activity exists
    const existing = await activityRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'activity', existing as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to delete this activity');
    }

    // Delete activity (soft by default, hard when permanent)
    const deleted = permanent
      ? await activityRepository.delete(params.id)
      : await activityRepository.softDelete(params.id, userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete activity' }, { status: 500 });
    }

    await auditLogRepository
      .logDelete('activity', params.id, existing.subject || existing.type, userId, user.name || '')
      .catch(() => undefined);

    return NextResponse.json({ success: true, message: permanent ? 'Activity permanently deleted' : 'Activity moved to trash' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting activity:', error);
    return NextResponse.json(
      { error: 'Failed to delete activity', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
