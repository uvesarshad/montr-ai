import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { favoriteRepository } from '@/lib/db/repository/crm/favorite.repository';
import { createFavoriteSchema } from '@/validations/crm/favorite.schema';
import { z } from 'zod';

/**
 * GET /api/v2/crm/favorites
 * List favorites for the current user with optional filtering
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const targetType = searchParams.get('targetType') as 'contact' | 'company' | 'deal' | 'view' | null;

    // Get favorites (optionally filtered by targetType)
    const favorites = await favoriteRepository.findByUser(
      userId,
      targetType || undefined
    );

    return NextResponse.json({ data: favorites, total: favorites.length });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching favorites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch favorites', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/favorites
 * Add a new favorite
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
    const validatedData = createFavoriteSchema.parse(body);

    // Check if already favorited
    const existing = await favoriteRepository.exists(
      userId,
      validatedData.targetType,
      validatedData.targetId
    );

    if (existing) {
      return NextResponse.json(
        { error: 'This item is already favorited' },
        { status: 400 }
      );
    }

    // Create favorite
    const favorite = await favoriteRepository.create({
      userId,
      targetType: validatedData.targetType,
      targetId: validatedData.targetId,
      folderId: validatedData.folderId,
    });

    return NextResponse.json(favorite, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating favorite:', error);
    return NextResponse.json(
      { error: 'Failed to create favorite', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
