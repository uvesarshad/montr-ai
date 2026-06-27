import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';

// GET /api/v2/crm/calendar-accounts - List calendar accounts
export async function GET(_request: NextRequest) {
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
    // Get calendar accounts for this user
    const accounts = await calendarAccountRepository.findByUser(userId);

    // Sanitize response - remove sensitive data
    const sanitizedAccounts = accounts.map((account) => ({
      id: account._id.toString(),
      email: account.email,
      displayName: account.displayName,
      provider: account.provider,
      isActive: account.isActive,
      calendars: account.calendars,
      syncEnabled: account.syncEnabled,
      syncDirection: account.syncDirection,
      autoLinkContacts: account.autoLinkContacts,
      lastSyncAt: account.lastSyncAt,
      lastSyncError: account.lastSyncError,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));

    return NextResponse.json({
      data: sanitizedAccounts,
      total: sanitizedAccounts.length,
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching calendar accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar accounts' },
      { status: 500 }
    );
  }
}

// POST /api/v2/crm/calendar-accounts - Create calendar account (used after OAuth)
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      email,
      displayName,
      provider,
      oauth,
      calendars,
      syncDirection,
      syncStartDate,
      autoLinkContacts,
    } = body;

    // Validate required fields
    if (!email || !provider || !oauth) {
      return NextResponse.json(
        { error: 'Email, provider, and oauth are required' },
        { status: 400 }
      );
    }

    // Check if account already exists
    const existingAccount = await calendarAccountRepository.findByEmail(
      email
    );
    if (existingAccount) {
      return NextResponse.json(
        { error: 'Calendar account already connected' },
        { status: 409 }
      );
    }

    // Create calendar account
    const account = await calendarAccountRepository.create({
      userId,
      email,
      displayName,
      provider,
      oauth,
      calendars,
      syncDirection,
      syncStartDate,
      autoLinkContacts,
    });

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
      autoLinkContacts: account.autoLinkContacts,
      createdAt: account.createdAt,
    };

    return NextResponse.json({
      data: sanitizedAccount,
      message: 'Calendar account connected successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating calendar account:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar account' },
      { status: 500 }
    );
  }
}
