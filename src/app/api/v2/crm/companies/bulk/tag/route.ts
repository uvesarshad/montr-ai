import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { bulkTagCompanySchema } from '@/validations/crm/company.schema';
import { emitTagAdded, emitTagRemoved } from '@/lib/crm';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

// Per-record event fan-out cap. Above this, manual-trigger bulk runs are the
// supported automation path at scale, so we skip per-record emission.
const BULK_EMIT_CAP = 50;

/**
 * POST /api/v2/crm/companies/bulk/tag
 * Bulk add or remove tags from companies
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const body = await request.json();

    // Validate input
    const validatedData = bulkTagCompanySchema.parse(body);

    // Single updateMany — much cheaper than the previous per-id loop.
    const successCount =
      validatedData.action === 'add'
        ? await companyRepository.bulkAddTags(
            validatedData.ids,
            validatedData.tagIds,
          )
        : await companyRepository.bulkRemoveTags(
            validatedData.ids,
            validatedData.tagIds,
          );

    // Emit per-record tag events (capped to avoid huge fan-out).
    if (successCount > 0 && validatedData.ids.length <= BULK_EMIT_CAP) {
      const emit = validatedData.action === 'add' ? emitTagAdded : emitTagRemoved;
      for (const id of validatedData.ids) {
        const company = await companyRepository.findById(id);
        if (!company) continue;
        for (const tagId of validatedData.tagIds) {
          await emit('company', company, tagId, userId);
        }
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      failedCount: Math.max(0, validatedData.ids.length - successCount),
      message: `Successfully ${validatedData.action === 'add' ? 'added' : 'removed'} tags for ${successCount} company(s)`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error bulk tagging companies:', error);
    return NextResponse.json(
      { error: 'Failed to bulk tag companies', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
