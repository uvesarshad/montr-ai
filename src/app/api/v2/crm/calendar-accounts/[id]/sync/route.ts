import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { syncCalendarAccount } from '@/lib/crm/calendar-sync';

// POST /api/v2/crm/calendar-accounts/[id]/sync - Trigger calendar sync
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    // Get user's organizationId
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCanManageSettings(await getCrmPermissionContext(userId));

    // Get calendar account
    const account = await calendarAccountRepository.findById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Calendar account not found' }, { status: 404 });
    }

    // Verify user owns this account
    if (account.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if account is active and sync is enabled
    if (!account.isActive || !account.syncEnabled) {
      return NextResponse.json(
        { error: 'Calendar sync is not enabled for this account' },
        { status: 400 }
      );
    }

    // Trigger sync
    await syncCalendarAccount(account);

    // Get updated account to return latest sync status
    const updatedAccount = await calendarAccountRepository.findById(
      params.id
    );

    return NextResponse.json({
      message: 'Calendar sync triggered successfully',
      data: {
        lastSyncAt: updatedAccount?.lastSyncAt,
        lastSyncError: updatedAccount?.lastSyncError,
      },
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error syncing calendar account:', error);
    return NextResponse.json(
      { error: 'Failed to sync calendar account' },
      { status: 500 }
    );
  }
}
