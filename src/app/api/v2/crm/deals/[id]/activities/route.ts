import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';

/**
 * GET /api/v2/crm/deals/[id]/activities
 * Get all activities for a specific deal
 * Note: This will be fully implemented when the Activity module is created
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    assertCrmPermission(await getCrmPermissionContext(userId), 'activity', 'read');
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

    // TODO: Implement activity fetching when Activity repository is created
    // For now, return empty array
    return NextResponse.json({
      data: [],
      total: 0,
      message: 'Activity module not yet implemented',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching deal activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal activities', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
