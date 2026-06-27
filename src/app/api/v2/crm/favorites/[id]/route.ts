import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { favoriteRepository } from '@/lib/db/repository/crm/favorite.repository';

/**
 * DELETE /api/v2/crm/favorites/[id]
 * Remove a favorite
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    // Check if favorite exists and belongs to user
    const favorite = await favoriteRepository.findById(params.id);

    if (!favorite) {
      return NextResponse.json({ error: 'Favorite not found' }, { status: 404 });
    }

    // Verify favorite belongs to the user
    if (favorite.userId.toString() !== userId) {
      return NextResponse.json(
        { error: 'You can only delete your own favorites' },
        { status: 403 }
      );
    }

    // Delete favorite
    const deleted = await favoriteRepository.delete(params.id, userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete favorite' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Favorite removed successfully' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting favorite:', error);
    return NextResponse.json(
      { error: 'Failed to delete favorite', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
