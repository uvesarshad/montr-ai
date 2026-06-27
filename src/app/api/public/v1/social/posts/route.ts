/**
 * Public API v1 — scheduled posts (Epic 6).
 *
 * GET  /api/public/v1/social/posts   — list the org's scheduled posts.
 * POST /api/public/v1/social/posts   — create a scheduled post.
 *
 * Authenticated via `x-api-key` (see `authenticateApiKey`). Multi-tenancy hard
 * rule: the organization is ALWAYS taken from the resolved key, never from the
 * request body. Brands are validated to belong to the key's org before use.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiKey } from '@/lib/social/api-auth';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import brandRepository from '@/lib/db/repository/brand.repository';
import { submitSocialPost } from '@/lib/social/social-post-submissions';
import type { IPlatformConfig, ScheduledPostStatus } from '@/lib/db/models/scheduled-post.model';

const READ_SCOPE = 'posts:read';
const WRITE_SCOPE = 'posts:write';

function hasScope(scopes: string[], scope: string): boolean {
    return scopes.includes(scope) || scopes.includes('*');
}

const platformSchema = z.object({
    accountId: z.string().min(1),
    platform: z.string().min(1),
    platformUsername: z.string().min(1),
    telegramChatIds: z.array(z.string()).optional(),
    redditSubreddit: z.string().optional(),
    redditTitle: z.string().optional(),
    pinterestBoardId: z.string().optional(),
    isThread: z.boolean().optional(),
    threadParts: z.array(z.string()).optional(),
});

const createSchema = z.object({
    // organizationId is intentionally NOT accepted — derived from the key.
    brandId: z.string().min(1),
    content: z.string().min(1),
    mediaUrls: z.array(z.string()).optional(),
    mediaTypes: z.array(z.enum(['image', 'video'])).optional(),
    altText: z.string().optional(),
    postFormat: z.enum(['standard', 'reel']).optional(),
    platforms: z.array(platformSchema).min(1),
    scheduledFor: z.string().optional(),
    timezone: z.string().optional(),
    intent: z.enum(['schedule', 'publish']).optional(),
});

// GET — list scheduled posts for the key's organization.
export async function GET(request: NextRequest) {
    const authResult = await authenticateApiKey(request);
    if (!authResult) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }
    if (!hasScope(authResult.scopes, READ_SCOPE)) {
        return NextResponse.json(
            { error: 'API key is missing the posts:read scope', code: 'SCOPE_REQUIRED' },
            { status: 402 },
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get('status');
        const status = statusParam ? (statusParam.split(',') as ScheduledPostStatus[]) : undefined;

        // Resolve every brand in the org, then list their posts. Scoping by the
        // org's brands keeps tenancy enforced even if older posts lack
        // organizationId (lazily backfilled).
        const brands = await brandRepository.findByOrganizationId();
        const brandIds = new Set(brands.map((b) => b._id.toString()));

        const postsNested = await Promise.all(
            brands.map((b) =>
                scheduledPostRepository.findByBrand(b._id.toString(), status ? { status } : undefined),
            ),
        );
        const posts = postsNested.flat().filter((p) => brandIds.has(p.brandId));

        return NextResponse.json({
            posts: posts.map((p) => ({
                id: p._id.toString(),
                brandId: p.brandId,
                content: p.content,
                mediaUrls: p.mediaUrls,
                platforms: p.platforms.map((pl) => ({
                    platform: pl.platform,
                    platformUsername: pl.platformUsername,
                })),
                scheduledFor: p.scheduledFor,
                timezone: p.timezone,
                status: p.status,
                createdAt: p.createdAt,
            })),
        });
    } catch (error) {
        console.error('[public-api] GET posts failed:', error);
        return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }
}

// POST — create a scheduled post in the key's organization.
export async function POST(request: NextRequest) {
    const authResult = await authenticateApiKey(request);
    if (!authResult) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }
    if (!hasScope(authResult.scopes, WRITE_SCOPE)) {
        return NextResponse.json(
            { error: 'API key is missing the posts:write scope', code: 'SCOPE_REQUIRED' },
            { status: 402 },
        );
    }

    try {
        const parsed = createSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request body', details: parsed.error.issues },
                { status: 400 },
            );
        }
        const body = parsed.data;

        // Tenancy: the brand MUST belong to the key's organization.
        const brand = await brandRepository.findById(body.brandId);
        if (!brand) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        const intent = body.intent === 'publish' ? 'publish' : 'schedule';

        const scheduledDate =
            intent === 'publish'
                ? new Date(body.scheduledFor || new Date().toISOString())
                : new Date(body.scheduledFor || '');
        if (isNaN(scheduledDate.getTime())) {
            return NextResponse.json({ error: 'Invalid scheduledFor date' }, { status: 400 });
        }
        if (intent === 'schedule' && scheduledDate <= new Date()) {
            return NextResponse.json(
                { error: 'scheduledFor must be in the future' },
                { status: 400 },
            );
        }

        const platforms: IPlatformConfig[] = body.platforms.map((p) => ({
            accountId: p.accountId,
            platform: p.platform,
            platformUsername: p.platformUsername,
            telegramChatIds: p.telegramChatIds,
            redditSubreddit: p.redditSubreddit,
            redditTitle: p.redditTitle,
            pinterestBoardId: p.pinterestBoardId,
            isThread: p.isThread,
            threadParts: p.threadParts,
        }));

        // Act as the key's creator (the brand is already org-validated, so the
        // submission's brand-access check passes via the shared organization).
        const { scheduledPost, requiresApproval } = await submitSocialPost({
            userId: authResult.createdByUserId,
            intent,
            brandId: body.brandId,
            content: body.content,
            mediaUrls: body.mediaUrls || [],
            mediaTypes: body.mediaTypes || [],
            altText: body.altText,
            postFormat: body.postFormat || 'standard',
            platforms,
            scheduledFor: scheduledDate,
            timezone: body.timezone || 'UTC',
        });

        return NextResponse.json(
            {
                success: true,
                requiresApproval,
                post: {
                    id: scheduledPost._id.toString(),
                    status: scheduledPost.status,
                    scheduledFor: scheduledPost.scheduledFor,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        console.error('[public-api] POST posts failed:', error);
        const message = error instanceof Error ? error.message : 'Failed to create post';
        if (/Access denied|not found/i.test(message)) {
            return NextResponse.json({ error: message }, { status: 403 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
