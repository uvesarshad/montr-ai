/**
 * Social inbox list (Epic 3).
 *
 * GET /api/social/inbox?brandId=&status=&platform=&limit=&skip=
 *   → { interactions, unreadCount }
 *
 * Brand/org scoped: organizationId is derived from the session user's brand via
 * `assertBrandAccess` — the client-supplied brandId is verified, never trusted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';
import { socialInteractionRepository } from '@/lib/db/repository/social-interaction.repository';
import type { SocialInteractionStatus } from '@/lib/db/models/social-interaction.model';

const VALID_STATUS: ReadonlySet<string> = new Set(['unread', 'read', 'archived']);

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

        // Verify access + derive the trusted organizationId.
        await assertBrandAccess(session.user.id, brandId);
        const statusParam = searchParams.get('status');
        const status =
            statusParam && VALID_STATUS.has(statusParam)
                ? (statusParam as SocialInteractionStatus)
                : undefined;
        const platform = searchParams.get('platform') || undefined;

        const limit = clampInt(searchParams.get('limit'), 50, 1, 100);
        const skip = clampInt(searchParams.get('skip'), 0, 0, 100000);

        const [interactions, unreadCount] = await Promise.all([
            socialInteractionRepository.listByBrand({
                brandId,
                status,
                platform,
                limit,
                skip,
            }),
            socialInteractionRepository.countUnread({ brandId }),
        ]);

        return NextResponse.json({ interactions, unreadCount });
    } catch (error) {
        if (error instanceof BrandAccessError) {
            return brandAccessErrorResponse(error);
        }
        console.error('[social.inbox] list error:', error);
        return NextResponse.json({ error: 'Failed to load inbox' }, { status: 500 });
    }
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
    const n = value ? Number.parseInt(value, 10) : NaN;
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}
