import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';
import { SOCIAL_INDUSTRIES } from '@/lib/strategy/benchmarks';

interface RouteParams {
    params: Promise<{ brandId: string }>;
}

// Industry must be one of the verticals the benchmark picker exposes (Epic 7.2).
const INDUSTRY_VALUES = SOCIAL_INDUSTRIES.map((i) => i.value) as [string, ...string[]];

const patchBodySchema = z.object({
    // `null` clears the industry; a string must be a known vertical.
    industry: z.union([z.enum(INDUSTRY_VALUES), z.null()]),
});

/**
 * Update a brand's industry vertical (drives benchmark baselines).
 * PATCH /api/social/brands/[brandId]
 * Body: { industry: SocialIndustry | null }
 *
 * Tenancy: ownership is re-derived from the session user's DB record via
 * `assertBrandAccess` — the client-supplied brandId is never trusted on its own.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { brandId } = await params;

        // Tenancy: confirm the brand belongs to the caller before any write.
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const json = await request.json().catch(() => null);
        const parsed = patchBodySchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid industry', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const updated = await brandRepository.update(brandId, {
            industry: parsed.data.industry,
        });

        if (!updated) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        return NextResponse.json({
            brand: { _id: updated._id, name: updated.name, industry: updated.industry ?? null },
        });
    } catch (error) {
        console.error('Error updating brand:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to update brand' },
            { status: 500 }
        );
    }
}
