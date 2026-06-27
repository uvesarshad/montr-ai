import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dealRepository, UpdateDealDto } from '@/lib/db/repository/crm/deal.repository';
import { updateDealSchema } from '@/validations/crm/deal.schema';
import { emitDealUpdated, emitDealStageChanged, emitDealDeleted } from '@/lib/crm';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';
import { getCrmPermissionContext, assertCrmPermission, ownsRecord, crmErrorResponse, CrmPermissionError } from '@/lib/crm/permissions';
import { z } from 'zod';

/** Compute a shallow change map over the validated payload keys. */
function computeChanges(
  previous: Record<string, unknown>,
  updated: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(payload)) {
    const from = previous?.[key];
    const to = updated?.[key];
    if (String(from) !== String(to)) {
      changes[key] = { from, to };
    }
  }
  return changes;
}

/**
 * GET /api/v2/crm/deals/[id]
 * Get a single deal by ID
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
    const dealId = params.id;

    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'deal', 'read');

    const deal = await dealRepository.findById(dealId);

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'deal', deal as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    return NextResponse.json(deal);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching deal:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/deals/[id]
 * Update a deal
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
    const dealId = params.id;

    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'deal', 'update');

    const body = await request.json();

    // Validate input
    const validatedData = updateDealSchema.parse(body);

    // Check if deal exists
    const existingDeal = await dealRepository.findById(dealId);
    if (!existingDeal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'deal', existingDeal as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to update this deal');
    }

    // Update deal - cast to any to handle validation schema type
    const updatedDeal = await dealRepository.update(
      dealId,
      validatedData as UpdateDealDto
    );

    if (updatedDeal) {
      const previousStageId = String(existingDeal.stageId ?? '');
      const newStageId = String(updatedDeal.stageId ?? '');
      const changes = computeChanges(
        existingDeal as unknown as Record<string, unknown>,
        updatedDeal as unknown as Record<string, unknown>,
        validatedData as Record<string, unknown>
      );
      if (Object.keys(changes).length > 0) {
        await emitDealUpdated(updatedDeal, changes, userId);
      }
      // If stageId was part of the payload and actually changed, also emit stage-change.
      if ('stageId' in (validatedData as Record<string, unknown>) && previousStageId !== newStageId) {
        await emitDealStageChanged(updatedDeal, previousStageId, userId);
      }
    }

    return NextResponse.json(updatedDeal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating deal:', error);
    return NextResponse.json(
      { error: 'Failed to update deal', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/deals/[id]
 * Soft-delete a deal (moves to trash). `?permanent=true` hard-deletes —
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
    const dealId = params.id;

    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'deal', 'delete');

    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';

    if (permanent && role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Only admins can permanently delete records' }, { status: 403 });
    }

    // Check if deal exists
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'deal', deal as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to delete this deal');
    }

    // Delete deal (soft by default, hard when permanent)
    const deleted = permanent
      ? await dealRepository.delete(dealId)
      : await dealRepository.softDelete(dealId, userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete deal' }, { status: 500 });
    }

    await emitDealDeleted(deal, userId);
    await auditLogRepository
      .logDelete('deal', dealId, deal.name, userId, user.name || '')
      .catch(() => undefined);

    return NextResponse.json({ success: true, message: permanent ? 'Deal permanently deleted' : 'Deal moved to trash' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting deal:', error);
    return NextResponse.json(
      { error: 'Failed to delete deal', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
