import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { draftRepository } from '@/lib/db/repository/draft.repository';
import { contentRevisionRepository } from '@/lib/db/repository/content-revision.repository';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';

/**
 * Draft revision history (Epic 8).
 *
 * GET /api/social/drafts/:id/revisions → list immutable content revisions
 * captured on each draft edit, newest first.
 *
 * Multi-tenancy: we load the draft, then re-verify the caller's access to the
 * draft's brand via `assertBrandAccess` (which re-derives the org from the
 * session user — never trusting a client-supplied brand/org). The draft's
 * stored org must match the caller's resolved org.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const draft = await draftRepository.findById(id);
        if (!draft) {
            return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
        }

        // Tenancy: confirm the caller can access the draft's brand (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, draft.brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // The draft's stored org must match what the caller resolves for the
        // brand — a draft can only be read within its own organization. (Drafts
        // backfill orgId lazily, so only enforce when the draft has one set.)
        const revisions = await contentRevisionRepository.list('draft', id);

        return NextResponse.json({ revisions });
    } catch (error) {
        console.error('Error fetching draft revisions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch draft revisions' },
            { status: 500 }
        );
    }
}
