import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { tagRepository } from '@/lib/db/repository/crm/tag.repository';
import { z } from 'zod';
import { Types } from 'mongoose';

const mergeTagSchema = z.object({
  sourceIds: z.array(z.string()).min(1, 'At least one source tag ID is required'),
});

/**
 * POST /api/v2/crm/tags/[id]/merge
 * Merge multiple tags into this tag
 * The tag at [id] is the target, sourceIds are merged into it
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    const organizationId = user.id!.toString();

    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);
    const targetId = params.id;
    const body = await request.json();

    // Validate input
    const validatedData = mergeTagSchema.parse(body);
    const { sourceIds } = validatedData;

    // Check if target tag exists
    const targetTag = await tagRepository.findById(targetId);
    if (!targetTag) {
      return NextResponse.json({ error: 'Target tag not found' }, { status: 404 });
    }

    // Verify all source tags exist
    const sourceTags = await Promise.all(
      sourceIds.map((id) => tagRepository.findById(id))
    );

    if (sourceTags.some((tag) => !tag)) {
      return NextResponse.json({ error: 'One or more source tags not found' }, { status: 404 });
    }

    // Import models for bulk updates
    const { default: CrmContact } = await import('@/lib/db/models/crm/contact.model');
    const { default: CrmCompany } = await import('@/lib/db/models/crm/company.model');
    const { default: CrmDeal } = await import('@/lib/db/models/crm/deal.model');
    await import('@/lib/mongodb').then(m => m.connectMongoose());

    const targetObjectId = new Types.ObjectId(targetId);
    const sourceObjectIds = sourceIds.map((id) => new Types.ObjectId(id));
    const orgObjectId = new Types.ObjectId(organizationId);

    // Update contacts: replace source tags with target tag
    await CrmContact.updateMany(
      {
        tags: { $in: sourceObjectIds },
      },
      {
        $pull: { tags: { $in: sourceObjectIds } },
      }
    ).exec();

    await CrmContact.updateMany(
      {
        tags: { $in: sourceObjectIds },
      },
      {
        $addToSet: { tags: targetObjectId },
      }
    ).exec();

    // Update companies
    await CrmCompany.updateMany(
      {
        tags: { $in: sourceObjectIds },
      },
      {
        $pull: { tags: { $in: sourceObjectIds } },
      }
    ).exec();

    await CrmCompany.updateMany(
      {
        tags: { $in: sourceObjectIds },
      },
      {
        $addToSet: { tags: targetObjectId },
      }
    ).exec();

    // Update deals
    await CrmDeal.updateMany(
      {
        tags: { $in: sourceObjectIds },
      },
      {
        $pull: { tags: { $in: sourceObjectIds } },
      }
    ).exec();

    await CrmDeal.updateMany(
      {
        tags: { $in: sourceObjectIds },
      },
      {
        $addToSet: { tags: targetObjectId },
      }
    ).exec();

    // Merge usage counts and delete source tags
    for (const sourceId of sourceIds) {
      const result = await tagRepository.merge(sourceId, targetId);
      if (!result.updatedTag) {
        console.error(`Failed to merge tag ${sourceId} into ${targetId}`);
      }
    }

    // Fetch updated target tag
    const updatedTag = await tagRepository.findById(targetId);

    return NextResponse.json({
      success: true,
      tag: updatedTag,
      mergedCount: sourceIds.length,
      message: `Successfully merged ${sourceIds.length} tag(s)`,
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
    console.error('Error merging tags:', error);
    return NextResponse.json(
      { error: 'Failed to merge tags', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
