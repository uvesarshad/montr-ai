import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';

/**
 * POST /api/v2/crm/deals/[id]/reopen
 * Reopen a closed deal
 */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Check if deal exists
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // Check if deal is closed
    if (deal.status === 'open') {
      return NextResponse.json({ error: 'Deal is already open' }, { status: 400 });
    }

    // Reopen deal
    const updatedDeal = await dealRepository.update(dealId, {
      status: 'open',
      actualCloseDate: null,
      wonReason: undefined,
      lostReason: undefined,
    });

    return NextResponse.json(updatedDeal);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error reopening deal:', error);
    return NextResponse.json(
      { error: 'Failed to reopen deal', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
