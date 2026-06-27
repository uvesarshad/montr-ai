import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';
import { computeBestTimes } from '@/lib/social/best-times';

// GET - Best-time-to-post recommendations derived from historical performance.
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');

        if (!brandId) {
            return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            const access = await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const result = await computeBestTimes(brandId);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error computing best times:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to compute best times' },
            { status: 500 }
        );
    }
}
