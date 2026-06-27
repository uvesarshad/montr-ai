import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';

// GET /api/v2/crm/calendar-accounts/[id] - Get single calendar account
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const account = await calendarAccountRepository.findById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Calendar account not found' }, { status: 404 });
    }

    // Verify user owns this account
    if (account.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Sanitize response
    const sanitizedAccount = {
      id: account._id.toString(),
      email: account.email,
      displayName: account.displayName,
      provider: account.provider,
      isActive: account.isActive,
      calendars: account.calendars,
      syncEnabled: account.syncEnabled,
      syncDirection: account.syncDirection,
      syncStartDate: account.syncStartDate,
      autoLinkContacts: account.autoLinkContacts,
      lastSyncAt: account.lastSyncAt,
      lastSyncError: account.lastSyncError,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    return NextResponse.json({ data: sanitizedAccount });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching calendar account:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar account' },
      { status: 500 }
    );
  }
}

// PATCH /api/v2/crm/calendar-accounts/[id] - Update calendar account
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Get existing account
    const account = await calendarAccountRepository.findById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Calendar account not found' }, { status: 404 });
    }

    // Verify user owns this account
    if (account.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      displayName,
      calendars,
      syncEnabled,
      syncDirection,
      syncStartDate,
      autoLinkContacts,
      isActive,
    } = body;

    // Update account
    const updatedAccount = await calendarAccountRepository.update(
      params.id,
      {
        displayName,
        calendars,
        syncEnabled,
        syncDirection,
        syncStartDate,
        autoLinkContacts,
        isActive,
      }
    );

    if (!updatedAccount) {
      return NextResponse.json(
        { error: 'Failed to update calendar account' },
        { status: 500 }
      );
    }

    // Sanitize response
    const sanitizedAccount = {
      id: updatedAccount._id.toString(),
      email: updatedAccount.email,
      displayName: updatedAccount.displayName,
      provider: updatedAccount.provider,
      isActive: updatedAccount.isActive,
      calendars: updatedAccount.calendars,
      syncEnabled: updatedAccount.syncEnabled,
      syncDirection: updatedAccount.syncDirection,
      syncStartDate: updatedAccount.syncStartDate,
      autoLinkContacts: updatedAccount.autoLinkContacts,
      updatedAt: updatedAccount.updatedAt,
    };

    return NextResponse.json({
      data: sanitizedAccount,
      message: 'Calendar account updated successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating calendar account:', error);
    return NextResponse.json(
      { error: 'Failed to update calendar account' },
      { status: 500 }
    );
  }
}

// DELETE /api/v2/crm/calendar-accounts/[id] - Delete calendar account
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Get existing account
    const account = await calendarAccountRepository.findById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Calendar account not found' }, { status: 404 });
    }

    // Verify user owns this account
    if (account.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete account
    const deleted = await calendarAccountRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete calendar account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Calendar account disconnected successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting calendar account:', error);
    return NextResponse.json(
      { error: 'Failed to delete calendar account' },
      { status: 500 }
    );
  }
}
