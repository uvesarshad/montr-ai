import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';

/**
 * POST /api/v2/crm/contacts/[id]/restore
 * Restore a soft-deleted contact from trash.
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
    assertCrmPermission(ctx, 'contact', 'delete');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const restored = await contactRepository.restore(params.id);
    if (!restored) {
      return NextResponse.json({ error: 'Contact not found in trash' }, { status: 404 });
    }

    await auditLogRepository
      .create({
        entityType: 'contact',
        entityId: params.id,
        entityName: `${restored.firstName} ${restored.lastName ?? ''}`.trim(),
        action: 'restored',
        userId,
        userName: user.name || '',
      })
      .catch(() => undefined);

    return NextResponse.json(restored);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error restoring contact:', error);
    return NextResponse.json(
      { error: 'Failed to restore contact', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
