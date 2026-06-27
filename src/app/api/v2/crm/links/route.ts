import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { recordLinkRepository } from '@/lib/db/repository/crm/record-link.repository';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';
import {
  createRecordLinkSchema,
  recordTypeSchema,
  CrmRecordTypeInput,
} from '@/validations/crm/record-link.schema';

/** Minimal hydrated view of the "other side" of a link. */
interface HydratedRecord {
  id: string;
  type: CrmRecordTypeInput;
  name: string;
  email?: string;
  value?: number;
  deleted?: boolean;
}

async function fetchRecordName(
  type: CrmRecordTypeInput,
  id: string
): Promise<{ exists: boolean; name?: string } > {
  if (type === 'contact') {
    const c = await contactRepository.findById(id);
    return c ? { exists: true, name: `${c.firstName} ${c.lastName || ''}`.trim() } : { exists: false };
  }
  if (type === 'company') {
    const c = await companyRepository.findById(id);
    return c ? { exists: true, name: c.name } : { exists: false };
  }
  const d = await dealRepository.findById(id);
  return d ? { exists: true, name: d.name } : { exists: false };
}

/** Batch-hydrate minimal projections for a set of {type,id} references. */
async function hydrateRecords(
  refs: { type: CrmRecordTypeInput; id: string }[]
): Promise<Map<string, HydratedRecord>> {
  const map = new Map<string, HydratedRecord>();
  await Promise.all(
    refs.map(async ({ type, id }) => {
      const key = `${type}:${id}`;
      if (map.has(key)) return;
      if (type === 'contact') {
        const c = await contactRepository.findById(id);
        map.set(key, c
          ? { id, type, name: `${c.firstName} ${c.lastName || ''}`.trim(), email: c.email }
          : { id, type, name: 'Unknown contact', deleted: true });
      } else if (type === 'company') {
        const c = await companyRepository.findById(id);
        map.set(key, c
          ? { id, type, name: c.name }
          : { id, type, name: 'Unknown company', deleted: true });
      } else {
        const d = await dealRepository.findById(id);
        map.set(key, d
          ? { id, type, name: d.name, value: d.value }
          : { id, type, name: 'Unknown deal', deleted: true });
      }
    })
  );
  return map;
}

/**
 * GET /api/v2/crm/links?recordType=&recordId=
 * List links touching a record, with the other-side records hydrated.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(session.user.id), 'contact', 'read');

    const { searchParams } = new URL(request.url);
    const recordType = recordTypeSchema.parse(searchParams.get('recordType'));
    const recordId = searchParams.get('recordId') || '';
    if (!/^[0-9a-fA-F]{24}$/.test(recordId)) {
      return NextResponse.json({ error: 'Invalid recordId' }, { status: 400 });
    }

    const annotated = await recordLinkRepository.listForRecord(recordType, recordId);
    const hydrated = await hydrateRecords(
      annotated.map((a) => a.other)
    );

    const data = annotated.map((a) => ({
      id: (a.link._id as { toString(): string }).toString(),
      direction: a.direction,
      linkType: a.linkType,
      createdAt: a.link.createdAt,
      record: hydrated.get(`${a.other.type}:${a.other.id}`) ?? {
        id: a.other.id,
        type: a.other.type,
        name: 'Unknown',
        deleted: true,
      },
    }));

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error listing record links:', error);
    return NextResponse.json({ error: 'Failed to list links' }, { status: 500 });
  }
}

/**
 * POST /api/v2/crm/links
 * Create a generic any↔any link between two CRM records.
 */
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const data = createRecordLinkSchema.parse(body);

    // Prevent self-link.
    if (data.sourceType === data.targetType && data.sourceId === data.targetId) {
      return NextResponse.json({ error: 'Cannot link a record to itself' }, { status: 400 });
    }

    // Verify BOTH records exist in the org.
    const [source, target] = await Promise.all([
      fetchRecordName(data.sourceType, data.sourceId),
      fetchRecordName(data.targetType, data.targetId),
    ]);
    if (!source.exists) {
      return NextResponse.json({ error: 'Source record not found' }, { status: 404 });
    }
    if (!target.exists) {
      return NextResponse.json({ error: 'Target record not found' }, { status: 404 });
    }

    const linkType = data.linkType?.trim() || 'related';

    // Dedupe (the unique index also guards this).
    const already = await recordLinkRepository.exists(
      data.sourceType,
      data.sourceId,
      data.targetType,
      data.targetId,
      linkType
    );
    if (already) {
      return NextResponse.json({ error: 'This link already exists' }, { status: 409 });
    }

    let link;
    try {
      link = await recordLinkRepository.create({
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        targetType: data.targetType,
        targetId: data.targetId,
        linkType,
        createdById: userId,
      });
    } catch (err) {
      // Unique-index race.
      if ((err as { code?: number })?.code === 11000) {
        return NextResponse.json({ error: 'This link already exists' }, { status: 409 });
      }
      throw err;
    }

    // Audit on the SOURCE record (best-effort).
    try {
      await auditLogRepository.create({
        entityType: data.sourceType,
        entityId: data.sourceId,
        entityName: source.name,
        action: 'updated',
        changes: [
          {
            field: 'recordLinks',
            oldValue: null,
            newValue: `${linkType} → ${data.targetType}:${data.targetId}`,
          },
        ],
        source: 'ui',
        userId,
        userName: user.name || user.email || 'User',
      });
    } catch (e) {
      console.warn('record-link audit (create) skipped:', e);
    }

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating record link:', error);
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }
}
