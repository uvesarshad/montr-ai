import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dealRepository, UpdateDealDto } from '@/lib/db/repository/crm/deal.repository';
import { bulkUpdateDealSchema } from '@/validations/crm/deal.schema';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * PATCH /api/v2/crm/deals/bulk/update
 * Bulk update deals
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
    const body = await request.json();

    // Validate input
    const validatedData = bulkUpdateDealSchema.parse(body);

    // Single updateMany replaces N findById/update pairs. modifiedCount
    // captures how many rows actually changed; the difference is treated as
    // "missing / unchanged", consistent with the other bulk endpoints.
    const successCount = await dealRepository.bulkUpdate(
      validatedData.ids,
      validatedData.updates as Partial<UpdateDealDto>,
    );
    const failedCount = Math.max(0, validatedData.ids.length - successCount);

    return NextResponse.json({
      success: successCount,
      failed: failedCount,
      results: {
        success: successCount,
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
    console.error('Error bulk updating deals:', error);
    return NextResponse.json(
      { error: 'Failed to bulk update deals', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
