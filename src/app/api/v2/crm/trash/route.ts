import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';

type EntityType = 'contact' | 'company' | 'deal';

interface TrashRow {
  id: string;
  label: string;
  deletedAt?: Date;
  deletedBy?: string;
}

/**
 * GET /api/v2/crm/trash?entityType=contact|company|deal&page=&limit=
 * Org-scoped list of trashed (soft-deleted) records.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const sp = request.nextUrl.searchParams;
    const entityType = (sp.get('entityType') || 'contact') as EntityType;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '25', 10) || 25));

    let rows: TrashRow[] = [];
    let pagination;

    if (entityType === 'contact') {
      const res = await contactRepository.listTrashed({ page, limit });
      rows = res.data.map(c => ({
        id: c._id.toString(),
        label: `${c.firstName} ${c.lastName ?? ''}`.trim() || c.email || 'Unnamed contact',
        deletedAt: c.deletedAt,
        deletedBy: c.deletedById?.toString(),
      }));
      pagination = res.pagination;
    } else if (entityType === 'company') {
      const res = await companyRepository.listTrashed({ page, limit });
      rows = res.data.map(c => ({
        id: c._id.toString(),
        label: c.name || 'Unnamed company',
        deletedAt: c.deletedAt,
        deletedBy: c.deletedById?.toString(),
      }));
      pagination = res.pagination;
    } else if (entityType === 'deal') {
      const res = await dealRepository.listTrashed({ page, limit });
      rows = res.data.map(d => ({
        id: d._id.toString(),
        label: d.name || 'Unnamed deal',
        deletedAt: d.deletedAt,
        deletedBy: d.deletedById?.toString(),
      }));
      pagination = res.pagination;
    } else {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }

    return NextResponse.json({ entityType, data: rows, pagination });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error listing trash:', error);
    return NextResponse.json(
      { error: 'Failed to list trash', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
