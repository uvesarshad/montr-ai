import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { bulkDeleteDealSchema } from '@/validations/crm/deal.schema';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * POST /api/v2/crm/deals/bulk/delete
 * Bulk delete deals
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
    const validatedData = bulkDeleteDealSchema.parse(body);

    // Soft-delete (move to trash) in a single updateMany.
    const deletedCount = await dealRepository.bulkSoftDelete(
      validatedData.ids,
      userId,
    );
    const failedCount = Math.max(0, validatedData.ids.length - deletedCount);

    return NextResponse.json({
      success: deletedCount,
      failed: failedCount,
      results: {
        success: deletedCount,
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
    console.error('Error bulk deleting deals:', error);
    return NextResponse.json(
      { error: 'Failed to bulk delete deals', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
