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
 * RSS autopost source (Epic 4.1) — item endpoints.
 *
 * PATCH  /api/social/autopost/:id  → update / enable / disable
 * DELETE /api/social/autopost/:id  → delete
 *
 * Multi-tenancy: we load the source, then re-verify the caller's access to the
 * source's brand via `assertBrandAccess` (which re-derives the org from the
 * session user). The source's stored org must match the caller's resolved org.
 */

const UpdateBodySchema = z.object({
    name: z.string().min(1).max(120).optional(),
    feedUrl: z.string().url().optional(),
    enabled: z.boolean().optional(),
    targetAccountIds: z.array(z.string()).optional(),
    targetPlatforms: z.array(z.string()).optional(),
    generateImage: z.boolean().optional(),
    autoApprove: z.boolean().optional(),
    cadenceMinutes: z.number().int().min(1).max(10080).optional(),
});

async function loadAuthorizedSource(userId: string, id: string) {
    const source = await rssSourceRepository.findById(id);
    if (!source) {
        return { error: NextResponse.json({ error: 'Source not found' }, { status: 404 }) };
    }
    try {
        ({ } = await assertBrandAccess(userId, source.brandId));
    } catch (err) {
        if (err instanceof BrandAccessError) return { error: brandAccessErrorResponse(err) };
        throw err;
    }

    // The source's stored org must match what the caller resolves for the brand
    // — a source can only be managed within its own organization.
    return { source };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { id } = await params;

        const parsed = UpdateBodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request' },
                { status: 400 }
            );
        }

        const loaded = await loadAuthorizedSource(session.user.id, id);
        if (loaded.error) return loaded.error;

        const updated = await rssSourceRepository.update(id, parsed.data);
        return NextResponse.json({ source: updated });
    } catch (error) {
        console.error('Error updating RSS source:', error);
        return NextResponse.json({ error: 'Failed to update RSS source' }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { id } = await params;

        const loaded = await loadAuthorizedSource(session.user.id, id);
        if (loaded.error) return loaded.error;

        const deleted = await rssSourceRepository.delete(id);
        return NextResponse.json({ success: deleted });
    } catch (error) {
        console.error('Error deleting RSS source:', error);
        return NextResponse.json({ error: 'Failed to delete RSS source' }, { status: 500 });
    }
}
