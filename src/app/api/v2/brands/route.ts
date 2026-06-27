import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import Brand from '@/lib/db/models/brand.model';
import { connectMongoose } from '@/lib/mongodb';

/**
 * GET /api/v2/brands
 *
 * List brands visible to the current user. A brand is visible if:
 *  - the user owns it (userId match), OR
 *  - the user belongs to the brand's organization.
 */
export async function GET(request: NextRequest) {
  void request;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const userId = session.user.id;
    const filter = { userId };

    const brands = await Brand.find(filter).sort({ createdAt: 1 }).lean().exec();

    return NextResponse.json({
      brands: brands.map(b => ({
        id: String(b._id),
        name: b.name,
        handle: b.handle,
        avatarUrl: b.avatarUrl ?? null,
        ownedByMe: b.userId === userId,
      })),
    });
  } catch (error) {
    console.error('Error listing brands:', error);
    return NextResponse.json(
      { error: 'Failed to list brands', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
