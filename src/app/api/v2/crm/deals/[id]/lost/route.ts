import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { emitDealLost } from '@/lib/crm';
import { z } from 'zod';

const markLostSchema = z.object({
  lostReason: z.string().max(500).optional(),
  actualCloseDate: z.string().transform(str => new Date(str)).optional(),
});

/**
 * POST /api/v2/crm/deals/[id]/lost
 * Mark a deal as lost
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'deal', 'update');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const dealId = params.id;
    const body = await request.json();

    // Validate input
    const validatedData = markLostSchema.parse(body);

    // Check if deal exists
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // Check if deal is already closed
    if (deal.status === 'lost') {
      return NextResponse.json({ error: 'Deal is already marked as lost' }, { status: 400 });
    }

    // Mark as lost
    const updatedDeal = await dealRepository.markAsLost(
      dealId,
      validatedData.lostReason
    );

    // Update actual close date if provided
    if (validatedData.actualCloseDate && updatedDeal) {
      await dealRepository.update(dealId, {
        actualCloseDate: validatedData.actualCloseDate,
      });
    }

    if (updatedDeal) {
      await emitDealLost(updatedDeal, userId);
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
    console.error('Error marking deal as lost:', error);
    return NextResponse.json(
      { error: 'Failed to mark deal as lost', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
