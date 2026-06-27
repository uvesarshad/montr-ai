import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';

/**
 * POST /api/v2/crm/trash/empty
 * Body: { entityType?: 'contact' | 'company' | 'deal' }
 * Permanently purges the org's trash (admin / super_admin only). When
 * entityType is omitted, all CRM entity types are purged.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'delete');
    const role = (session.user as { role?: string }).role;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Only admins can empty the trash' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const entityType = body?.entityType as 'contact' | 'company' | 'deal' | undefined;

    // Far-future cutoff purges everything currently in trash.
    const cutoff = new Date(Date.now() + 60_000);

    let purged = 0;
    if (!entityType || entityType === 'contact') {
      purged += await contactRepository.purgeOlderThan(cutoff);
    }
    if (!entityType || entityType === 'company') {
      purged += await companyRepository.purgeOlderThan(cutoff);
    }
    if (!entityType || entityType === 'deal') {
      purged += await dealRepository.purgeOlderThan(cutoff);
    }

    return NextResponse.json({ success: true, purged });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error emptying trash:', error);
    return NextResponse.json(
      { error: 'Failed to empty trash', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
