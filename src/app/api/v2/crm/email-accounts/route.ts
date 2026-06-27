import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';

// GET /api/v2/crm/email-accounts - List email accounts
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
    // Get email accounts for this user
    const accounts = await emailAccountRepository.findByUser(userId);

    // Sanitize response - remove sensitive data
    const sanitizedAccounts = accounts.map((account) => ({
      id: account._id.toString(),
      email: account.email,
      displayName: account.displayName,
      provider: account.provider,
      isActive: account.isActive,
      syncEnabled: account.syncEnabled,
      syncFolders: account.syncFolders,
      autoLinkContacts: account.autoLinkContacts,
      autoCreateContacts: account.autoCreateContacts,
      autoCreateCompanies: account.autoCreateCompanies,
      lastSyncAt: account.lastSyncAt,
      lastSyncError: account.lastSyncError,
      totalEmailsSynced: account.totalEmailsSynced,
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
    console.error('Error fetching email accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email accounts' },
      { status: 500 }
    );
  }
}

// POST /api/v2/crm/email-accounts - Create email account (used after OAuth)
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
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);

    const body = await request.json();
    const {
      email,
      displayName,
      provider,
      oauth,
      imap,
      smtp,
      syncFolders,
      syncStartDate,
      autoLinkContacts,
      autoCreateContacts,
      autoCreateCompanies,
      signature,
    } = body;

    // Validate required fields
    if (!email || !provider) {
      return NextResponse.json(
        { error: 'Email and provider are required' },
        { status: 400 }
      );
    }

    // Check if account already exists
    const existingAccount = await emailAccountRepository.findByEmail(
      email
    );
    if (existingAccount) {
      return NextResponse.json(
        { error: 'Email account already connected' },
        { status: 409 }
      );
    }

    // Create email account
    const account = await emailAccountRepository.create({
      userId,
      email,
      displayName,
      provider,
      oauth,
      imap,
      smtp,
      syncFolders,
      syncStartDate,
      autoLinkContacts,
      autoCreateContacts,
      autoCreateCompanies,
      signature,
    });

    // Sanitize response
    const sanitizedAccount = {
      id: account._id.toString(),
      email: account.email,
      displayName: account.displayName,
      provider: account.provider,
      isActive: account.isActive,
      syncEnabled: account.syncEnabled,
      syncFolders: account.syncFolders,
      autoLinkContacts: account.autoLinkContacts,
      autoCreateContacts: account.autoCreateContacts,
      autoCreateCompanies: account.autoCreateCompanies,
      totalEmailsSynced: account.totalEmailsSynced,
      createdAt: account.createdAt,
    };

    return NextResponse.json({
      data: sanitizedAccount,
      message: 'Email account connected successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating email account:', error);
    return NextResponse.json(
      { error: 'Failed to create email account' },
      { status: 500 }
    );
  }
}
