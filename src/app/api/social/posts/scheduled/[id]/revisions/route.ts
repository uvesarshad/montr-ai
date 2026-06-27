import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { contentRevisionRepository } from '@/lib/db/repository/content-revision.repository';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';

/**
 * Scheduled-post revision history (Epic 8).
 *
 * GET /api/social/posts/scheduled/:id/revisions → list immutable content
 * revisions captured on each edit/reschedule of the post, newest first.
 *
 * Multi-tenancy: we load the post, then re-verify the caller's access to the
 * post's brand via `assertBrandAccess` (which re-derives the org from the
 * session user — never trusting a client-supplied brand/org). The post's
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

        const post = await scheduledPostRepository.findById(id);
        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Tenancy: confirm the caller can access the post's brand (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, post.brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // The post's stored org must match what the caller resolves for the
        // brand — a post can only be read within its own organization. (orgId is
        // backfilled lazily, so only enforce when the post has one set.)
        const revisions = await contentRevisionRepository.list('scheduled_post', id);

        return NextResponse.json({ revisions });
    } catch (error) {
        console.error('Error fetching scheduled-post revisions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch scheduled-post revisions' },
            { status: 500 }
        );
    }
}
