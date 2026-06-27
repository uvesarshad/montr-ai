import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { favoriteRepository } from '@/lib/db/repository/crm/favorite.repository';
import { z } from 'zod';

// Validation schema for check request
const checkFavoriteSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'view']),
  targetId: z.string().min(1),
});

/**
 * POST /api/v2/crm/favorites/check
 * Check if a record is favorited
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
    const validatedData = checkFavoriteSchema.parse(body);

    // Check if favorite exists
    const isFavorited = await favoriteRepository.exists(
      userId,
      validatedData.targetType,
      validatedData.targetId
    );

    return NextResponse.json({ favorited: isFavorited });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error checking favorite:', error);
    return NextResponse.json(
      { error: 'Failed to check favorite', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
