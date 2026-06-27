import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';

/**
 * POST /api/v2/crm/companies/[id]/restore
 * Restore a soft-deleted company from trash.
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
    assertCrmPermission(ctx, 'company', 'delete');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const restored = await companyRepository.restore(params.id);
    if (!restored) {
      return NextResponse.json({ error: 'Company not found in trash' }, { status: 404 });
    }

    await auditLogRepository
      .create({
        entityType: 'company',
        entityId: params.id,
        entityName: restored.name,
        action: 'restored',
        userId,
        userName: user.name || '',
      })
      .catch(() => undefined);

    return NextResponse.json(restored);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error restoring company:', error);
    return NextResponse.json(
      { error: 'Failed to restore company', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
