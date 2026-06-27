import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { scanDuplicates, type DedupeEntityType } from '@/lib/crm/dedupe';
import { dedupeEntityTypeSchema } from '@/validations/crm/dedupe-rule.schema';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * GET /api/v2/crm/duplicates?entityType=contact&page=1
 * Returns duplicate clusters for the given entity type.
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
    const { searchParams } = new URL(request.url);
    const entityTypeParam = dedupeEntityTypeSchema.parse(
      searchParams.get('entityType') || 'contact'
    ) as DedupeEntityType;
    assertCrmPermission(await getCrmPermissionContext(session.user.id), entityTypeParam, 'read');

    const entityType = dedupeEntityTypeSchema.parse(
      searchParams.get('entityType') || 'contact'
    ) as DedupeEntityType;
    const page = parseInt(searchParams.get('page') || '1', 10);

    const result = await scanDuplicates(entityType, { page });
    return NextResponse.json({ entityType, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error scanning duplicates:', error);
    return NextResponse.json({ error: 'Failed to scan duplicates' }, { status: 500 });
  }
}
