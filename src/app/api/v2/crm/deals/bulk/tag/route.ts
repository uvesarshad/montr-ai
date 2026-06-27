import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { bulkTagDealSchema } from '@/validations/crm/deal.schema';
import { emitTagAdded, emitTagRemoved } from '@/lib/crm';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

// Per-record event fan-out cap. Above this, manual-trigger bulk runs are the
// supported automation path at scale, so we skip per-record emission.
const BULK_EMIT_CAP = 50;

/**
 * POST /api/v2/crm/deals/bulk/tag
 * Bulk add or remove tags from deals
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
    const body = await request.json();

    // Validate input
    const validatedData = bulkTagDealSchema.parse(body);

    // Single updateMany ($addToSet / $pull) replaces the previous per-id
    // loop. We no longer return per-id failure rows because the operation
    // either matched a doc (and modified it) or didn't.
    const modifiedCount =
      validatedData.action === 'add'
        ? await dealRepository.bulkAddTags(
            validatedData.ids,
            validatedData.tagIds,
          )
        : await dealRepository.bulkRemoveTags(
            validatedData.ids,
            validatedData.tagIds,
          );

    const failedCount = Math.max(0, validatedData.ids.length - modifiedCount);

    // Emit per-record tag events (capped to avoid huge fan-out).
    if (modifiedCount > 0 && validatedData.ids.length <= BULK_EMIT_CAP) {
      const emit = validatedData.action === 'add' ? emitTagAdded : emitTagRemoved;
      for (const id of validatedData.ids) {
        const deal = await dealRepository.findById(id);
        if (!deal) continue;
        for (const tagId of validatedData.tagIds) {
          await emit('deal', deal, tagId, userId);
        }
      }
    }

    return NextResponse.json({
      success: modifiedCount,
      failed: failedCount,
      results: {
        success: modifiedCount,
        failed: failedCount,
      },
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
    console.error('Error bulk tagging deals:', error);
    return NextResponse.json(
      { error: 'Failed to bulk tag deals', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
