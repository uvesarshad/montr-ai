import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { favoriteRepository } from '@/lib/db/repository/crm/favorite.repository';
import { z } from 'zod';

// Validation schema for toggle request
const toggleFavoriteSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'view']),
  targetId: z.string().min(1),
  folderId: z.string().optional(),
});

/**
 * POST /api/v2/crm/favorites/toggle
 * Toggle favorite status - add if not exists, remove if exists
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
    const validatedData = toggleFavoriteSchema.parse(body);

    // Check if favorite already exists
    const exists = await favoriteRepository.exists(
      userId,
      validatedData.targetType,
      validatedData.targetId
    );

    if (exists) {
      // Remove favorite
      const removed = await favoriteRepository.deleteByTarget(
        userId,
        validatedData.targetType,
        validatedData.targetId
      );

      if (!removed) {
        return NextResponse.json(
          { error: 'Failed to remove favorite' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        favorited: false,
        message: 'Favorite removed successfully',
      });
    } else {
      // Add favorite
      const favorite = await favoriteRepository.create({
        userId,
        targetType: validatedData.targetType,
        targetId: validatedData.targetId,
        folderId: validatedData.folderId,
      });

      return NextResponse.json({
        success: true,
        favorited: true,
        message: 'Favorite added successfully',
        data: favorite,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error toggling favorite:', error);
    return NextResponse.json(
      { error: 'Failed to toggle favorite', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
