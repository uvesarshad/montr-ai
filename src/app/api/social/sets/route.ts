import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { channelSetRepository } from '@/lib/db/repository/channel-set.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

const createSetSchema = z.object({
    brandId: z.string().min(1),
    name: z.string().min(1),
    accountIds: z.array(z.string()).optional(),
});

/**
 * GET /api/social/sets?brandId=...
 * List saved channel sets (presets) for a brand.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        if (!brandId) {
            return NextResponse.json({ error: 'brandId required' }, { status: 400 });
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }
        const sets = await channelSetRepository.listByBrand(brandId);
        return NextResponse.json({ sets });
    } catch (error) {
        console.error('Error fetching channel sets:', error);
        return NextResponse.json({ error: 'Failed to fetch channel sets' }, { status: 500 });
    }
}

/**
 * POST /api/social/sets
 * Create a channel set. Body: { brandId, name, accountIds }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const parsed = createSetSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'brandId and name are required' }, { status: 400 });
        }
        const { brandId, name, accountIds } = parsed.data;

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }
        const set = await channelSetRepository.create({
            brandId,
            userId: session.user.id,
            name,
            accountIds: accountIds ?? [],
        });

        return NextResponse.json({ set }, { status: 201 });
    } catch (error) {
        console.error('Error creating channel set:', error);
        return NextResponse.json({ error: 'Failed to create channel set' }, { status: 500 });
    }
}

/**
 * DELETE /api/social/sets?id=...
 * Delete a channel set.
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id required' }, { status: 400 });
        }

        // Tenancy: load the set and confirm its brand belongs to the caller (audit C4).
        const existing = await channelSetRepository.findById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Channel set not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const deleted = await channelSetRepository.delete(id);
        if (!deleted) {
            return NextResponse.json({ error: 'Channel set not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting channel set:', error);
        return NextResponse.json({ error: 'Failed to delete channel set' }, { status: 500 });
    }
}
