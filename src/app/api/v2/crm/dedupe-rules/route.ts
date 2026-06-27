import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { connectMongoose } from '@/lib/mongodb';
import CrmDedupeRule from '@/lib/db/models/crm/dedupe-rule.model';
import { getDedupeRules, type DedupeEntityType } from '@/lib/crm/dedupe';
import { updateDedupeRulesSchema, dedupeEntityTypeSchema } from '@/validations/crm/dedupe-rule.schema';
import { z } from 'zod';

async function resolveOrg() {
  const session = await getSession();
  if (!session?.user?.id) return { error: 'Unauthorized', status: 401 as const };
  return { };
}

/**
 * GET /api/v2/crm/dedupe-rules?entityType=contact
 * Returns effective rules (stored or defaults) with an `isDefault` flag.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveOrg();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const entityType = dedupeEntityTypeSchema.parse(
      searchParams.get('entityType') || 'contact'
    ) as DedupeEntityType;

    const rules = await getDedupeRules(entityType);
    return NextResponse.json({ entityType, ...rules });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching dedupe rules:', error);
    return NextResponse.json({ error: 'Failed to fetch dedupe rules' }, { status: 500 });
  }
}

/**
 * PUT /api/v2/crm/dedupe-rules
 * Upserts the org's rule document for an entity type.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await resolveOrg();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    assertCanManageSettings(await getCrmPermissionContext());

    const body = await request.json();
    const data = updateDedupeRulesSchema.parse(body);

    await connectMongoose();
    const doc = await CrmDedupeRule.findOneAndUpdate(
      { entityType: data.entityType },
      {
        $set: {
          criteria: data.criteria,
          isActive: data.isActive,
        },
        $setOnInsert: {
          entityType: data.entityType,
        },
      },
      { new: true, upsert: true }
    ).lean().exec();

    return NextResponse.json({
      entityType: data.entityType,
      criteria: doc?.criteria ?? data.criteria,
      isActive: doc?.isActive ?? data.isActive,
      isDefault: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error saving dedupe rules:', error);
    return NextResponse.json({ error: 'Failed to save dedupe rules' }, { status: 500 });
  }
}
