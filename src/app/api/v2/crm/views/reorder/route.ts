import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { viewRepository } from '@/lib/db/repository/crm/view.repository';
import CrmView from '@/lib/db/models/crm/view.model';
import { z } from 'zod';
import { Types } from 'mongoose';

// Validation schema for reorder request
const reorderViewsSchema = z.object({
  entityType: z.enum(['contact', 'company', 'deal', 'activity']),
  views: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
    })
  ),
});

/**
 * POST /api/v2/crm/views/reorder
 * Reorder pinned views for sidebar
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const body = await request.json();

    // Validate input
    const validatedData = reorderViewsSchema.parse(body);

    // Single fetch of all requested views (one round-trip instead of N) so
    // we can verify ownership, access, and entityType locally.
    const ids = validatedData.views.map(v => new Types.ObjectId(v.id));
    const views = await CrmView.find({ _id: { $in: ids } }).exec();
    const byId = new Map(views.map(v => [v._id.toString(), v]));

    for (const viewOrder of validatedData.views) {
      const view = byId.get(viewOrder.id);
      if (!view) {
        return NextResponse.json(
          { error: `View with id ${viewOrder.id} not found` },
          { status: 404 }
        );
      }
      const hasAccess =
        view.visibility === 'organization' ||
        (view.visibility === 'team' && view.sharedWith.some(id => id.toString() === userId)) ||
        view.ownerId.toString() === userId;
      if (!hasAccess) {
        return NextResponse.json(
          { error: `Access denied to view ${viewOrder.id}` },
          { status: 403 }
        );
      }
      if (view.entityType !== validatedData.entityType) {
        return NextResponse.json(
          { error: `View ${viewOrder.id} does not match entity type ${validatedData.entityType}` },
          { status: 400 }
        );
      }
    }

    // Reorder views (single bulkWrite under the hood).
    await viewRepository.reorder(
      validatedData.entityType,
      validatedData.views
    );

    return NextResponse.json({ success: true, message: 'Views reordered successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error reordering views:', error);
    return NextResponse.json(
      { error: 'Failed to reorder views', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
