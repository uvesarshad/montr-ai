import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { viewRepository } from '@/lib/db/repository/crm/view.repository';

/**
 * POST /api/v2/crm/views/[id]/unpin
 * Unpin a view from sidebar
 */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const view = await viewRepository.findById(params.id);

    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    // Check if user has access to this view
    const hasAccess =
      view.visibility === 'organization' ||
      (view.visibility === 'team' && view.sharedWith.some(id => id.toString() === userId)) ||
      view.ownerId.toString() === userId;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // If already unpinned, return success
    if (!view.isPinned) {
      return NextResponse.json(view);
    }

    // Update view to be unpinned
    const updatedView = await viewRepository.update(params.id, {
      isPinned: false,
      order: 0,
    });

    if (!updatedView) {
      return NextResponse.json({ error: 'Failed to unpin view' }, { status: 500 });
    }

    return NextResponse.json(updatedView);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error unpinning view:', error);
    return NextResponse.json(
      { error: 'Failed to unpin view', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
