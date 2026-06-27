import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { recordLayoutRepository } from '@/lib/db/repository/crm/record-layout.repository';
import {
  defaultLayoutFor,
  mergeLayout,
  type RecordLayoutEntityType,
} from '@/components/crm/shared/record-layout-sections';
import {
  recordLayoutEntityTypeSchema,
  updateRecordLayoutSchema,
} from '@/validations/crm/record-layout.schema';
import { z } from 'zod';

async function resolveOrg() {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { error: 'Unauthorized', status: 401 as const };
  return { userId };
}

/**
 * GET /api/v2/crm/record-layouts?entityType=contact
 * Returns the effective layout (saved merged with catalog, or defaults) plus an
 * `isDefault` flag indicating no saved layout exists.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveOrg();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const entityType = recordLayoutEntityTypeSchema.parse(
      searchParams.get('entityType') || 'contact'
    ) as RecordLayoutEntityType;

    const saved = await recordLayoutRepository.get(entityType);
    const isDefault = !saved || saved.sections.length === 0;
    const sections = isDefault
      ? defaultLayoutFor(entityType)
      : mergeLayout(
          entityType,
          saved.sections.map((s) => ({
            key: s.key,
            visible: s.visible,
            order: s.order,
            column: s.column ?? 'main',
          }))
        );

    return NextResponse.json({ entityType, sections, isDefault });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching record layout:', error);
    return NextResponse.json({ error: 'Failed to fetch record layout' }, { status: 500 });
  }
}

/**
 * PUT /api/v2/crm/record-layouts
 * Upserts the org's record layout for an entity type.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await resolveOrg();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    assertCanManageSettings(await getCrmPermissionContext());

    const body = await request.json();
    const data = updateRecordLayoutSchema.parse(body);

    const doc = await recordLayoutRepository.upsert({
      entityType: data.entityType,
      sections: data.sections,
      updatedById: ctx.userId,
    });

    const sections = mergeLayout(
      data.entityType,
      (doc.sections ?? data.sections).map((s) => ({
        key: s.key,
        visible: s.visible,
        order: s.order,
        column: (s.column ?? 'main') as 'main' | 'side',
      }))
    );

    return NextResponse.json({ entityType: data.entityType, sections, isDefault: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error saving record layout:', error);
    return NextResponse.json({ error: 'Failed to save record layout' }, { status: 500 });
  }
}
