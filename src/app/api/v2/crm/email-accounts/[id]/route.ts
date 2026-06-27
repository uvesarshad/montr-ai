import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';

// GET /api/v2/crm/email-accounts/[id] - Get single email account
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
    const account = await emailAccountRepository.findById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
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
      syncEnabled: account.syncEnabled,
      syncFolders: account.syncFolders,
      syncStartDate: account.syncStartDate,
      autoLinkContacts: account.autoLinkContacts,
      autoCreateContacts: account.autoCreateContacts,
      autoCreateCompanies: account.autoCreateCompanies,
      lastSyncAt: account.lastSyncAt,
      lastSyncError: account.lastSyncError,
      totalEmailsSynced: account.totalEmailsSynced,
      signature: account.signature,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    return NextResponse.json({ data: sanitizedAccount });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching email account:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email account' },
      { status: 500 }
    );
  }
}

// PATCH /api/v2/crm/email-accounts/[id] - Update email account
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
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);

    // Get existing account
    const account = await emailAccountRepository.findById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    // Verify user owns this account
    if (account.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      displayName,
      syncEnabled,
      syncFolders,
      syncStartDate,
      autoLinkContacts,
      autoCreateContacts,
      autoCreateCompanies,
      signature,
      isActive,
    } = body;

    // Update account
    const updatedAccount = await emailAccountRepository.update(
      params.id,
      {
        displayName,
        syncEnabled,
        syncFolders,
        syncStartDate,
        autoLinkContacts,
        autoCreateContacts,
        autoCreateCompanies,
        signature,
        isActive,
      }
    );

    if (!updatedAccount) {
      return NextResponse.json(
        { error: 'Failed to update email account' },
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
      syncEnabled: updatedAccount.syncEnabled,
      syncFolders: updatedAccount.syncFolders,
      syncStartDate: updatedAccount.syncStartDate,
      autoLinkContacts: updatedAccount.autoLinkContacts,
      autoCreateContacts: updatedAccount.autoCreateContacts,
      autoCreateCompanies: updatedAccount.autoCreateCompanies,
      signature: updatedAccount.signature,
      updatedAt: updatedAccount.updatedAt,
    };

    return NextResponse.json({
      data: sanitizedAccount,
      message: 'Email account updated successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating email account:', error);
    return NextResponse.json(
      { error: 'Failed to update email account' },
      { status: 500 }
    );
  }
}

// DELETE /api/v2/crm/email-accounts/[id] - Delete email account
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
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);

    // Get existing account
    const account = await emailAccountRepository.findById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    // Verify user owns this account
    if (account.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete account
    const deleted = await emailAccountRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete email account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Email account disconnected successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting email account:', error);
    return NextResponse.json(
      { error: 'Failed to delete email account' },
      { status: 500 }
    );
  }
}
