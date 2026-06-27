import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { recordLinkRepository } from '@/lib/db/repository/crm/record-link.repository';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';

/**
 * DELETE /api/v2/crm/links/[id]
 * Remove a generic record link (org-scoped).
 */
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(session.user.id), 'contact', 'update');

    const link = await recordLinkRepository.findById(params.id);
    if (!link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    const deleted = await recordLinkRepository.delete(params.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // Audit on the SOURCE record (best-effort).
    try {
      await auditLogRepository.create({
        entityType: link.sourceType,
        entityId: link.sourceId.toString(),
        action: 'updated',
        changes: [
          {
            field: 'recordLinks',
            oldValue: `${link.linkType} → ${link.targetType}:${link.targetId.toString()}`,
            newValue: null,
          },
        ],
        source: 'ui',
        userId,
        userName: user.name || user.email || 'User',
      });
    } catch (e) {
      console.warn('record-link audit (delete) skipped:', e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting record link:', error);
    return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 });
  }
}
