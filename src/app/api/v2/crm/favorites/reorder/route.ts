import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { favoriteRepository } from '@/lib/db/repository/crm/favorite.repository';
import { z } from 'zod';

// Validation schema for reorder request
const reorderFavoritesSchema = z.object({
  favorites: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
    })
  ),
});

/**
 * POST /api/v2/crm/favorites/reorder
 * Reorder favorites for display
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const body = await request.json();

    // Validate input
    const validatedData = reorderFavoritesSchema.parse(body);

    // Ownership check is implicit in the reorder query (the bulkWrite filters
    // by `{ _id, userId }`), so a foreign id silently no-ops rather than
    // throwing. Reorder favorites in a single bulkWrite.
    await favoriteRepository.reorder(userId, validatedData.favorites);

    return NextResponse.json({ success: true, message: 'Favorites reordered successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error reordering favorites:', error);
    return NextResponse.json(
      { error: 'Failed to reorder favorites', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
