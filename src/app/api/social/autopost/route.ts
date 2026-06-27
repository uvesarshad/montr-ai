import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { rssSourceRepository } from '@/lib/db/repository/rss-source.repository';
import {
    assertBrandAccess,
    brandAccessErrorResponse,
    BrandAccessError,
} from '@/lib/social/brand-access';

/**
 * RSS autopost sources (Epic 4.1) — collection endpoints.
 *
 * GET  /api/social/autopost?brandId=...  → list sources for a brand
 * POST /api/social/autopost              → create a source
 *
 * Multi-tenancy: the client-supplied `brandId` is never trusted. We re-derive
 * the org from the session user's brand ownership via `assertBrandAccess`.
 */

const CreateBodySchema = z.object({
    brandId: z.string().min(1, 'brandId is required'),
    name: z.string().min(1, 'name is required').max(120),
    feedUrl: z.string().url('A valid feed URL is required'),
    enabled: z.boolean().optional(),
    targetAccountIds: z.array(z.string()).optional(),
    targetPlatforms: z.array(z.string()).optional(),
    generateImage: z.boolean().optional(),
    autoApprove: z.boolean().optional(),
    cadenceMinutes: z.number().int().min(1).max(10080).optional(),
});

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const brandId = request.nextUrl.searchParams.get('brandId');
        if (!brandId) {
            return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
        }
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const sources = await rssSourceRepository.listByBrand(brandId);
        return NextResponse.json({ sources });
    } catch (error) {
        console.error('Error listing RSS sources:', error);
        return NextResponse.json({ error: 'Failed to list RSS sources' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const parsed = CreateBodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request' },
                { status: 400 }
            );
        }
        const body = parsed.data;
        try {
            ({ } = await assertBrandAccess(session.user.id, body.brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }
        const source = await rssSourceRepository.create({
            brandId: body.brandId,
            userId: session.user.id,
            name: body.name,
            feedUrl: body.feedUrl,
            enabled: body.enabled,
            targetAccountIds: body.targetAccountIds,
            targetPlatforms: body.targetPlatforms,
            generateImage: body.generateImage,
            autoApprove: body.autoApprove,
            cadenceMinutes: body.cadenceMinutes,
        });

        return NextResponse.json({ source }, { status: 201 });
    } catch (error) {
        console.error('Error creating RSS source:', error);
        return NextResponse.json({ error: 'Failed to create RSS source' }, { status: 500 });
    }
}
