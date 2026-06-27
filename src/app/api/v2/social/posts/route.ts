import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import brandRepository from '@/lib/db/repository/brand.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { submitSocialPost } from '@/lib/social/social-post-submissions';
import type { IPlatformConfig } from '@/lib/db/models/scheduled-post.model';
import type { SocialPlatform } from '@/lib/db/models/social-account.model';

/**
 * POST /api/v2/social/posts — publish-now from the Canvas Publish node.
 *
 * Audit C5 (2026-06-06): this route used to be fake-publish scaffolding —
 * it mapped channel strings to `accountId: 'default'`, used `userId` as a
 * fallback `brandId`, and wrote `status: 'published'` without ever calling a
 * platform. It now resolves the user's REAL brand (ownership verified against
 * the session user's DB record), resolves the actual connected accounts for the
 * requested platforms, and routes through `submitSocialPost()` so the post goes
 * through the same queue + approval pipeline as scheduled posts.
 */

const postSchema = z.object({
    userId: z.string(),
    brandId: z.string().min(1, 'brandId is required'),
    caption: z.string(),
    mediaUrl: z.string().nullable().optional(),
    mediaType: z.enum(['image', 'video']).nullable().optional(),
    channels: z.array(z.string()).min(1, 'At least one channel is required'),
    // Accepted for backward compat with the existing caller payload; ignored —
    // status/publishedAt are derived server-side (publish now).
    status: z.string().optional(),
    publishedAt: z.string().optional(),
});

export async function POST(req: Request) {
    try {
        const session = await getSession();
        const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
        if (!sessionUserId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const json = await req.json();
        const body = postSchema.parse(json);

        // Never trust the client-supplied userId — pin everything to the
        // session user.
        if (body.userId && body.userId !== sessionUserId) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Resolve + authorize the brand against the session user's DB record
        // (mirrors getSubmissionContext in social-post-submissions.ts).
        const [user, brand] = await Promise.all([
            userRepository.findById(sessionUserId),
            brandRepository.findById(body.brandId),
        ]);

        if (!user) {
            return new NextResponse('User not found', { status: 404 });
        }
        if (!brand) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        const canAccessBrand =
            brand.userId === sessionUserId ||
            Boolean(user.id && brand.userId && user.id! === brand.userId);

        if (!canAccessBrand) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Resolve real connected accounts for this brand.
        const accounts = await socialAccountRepository.findByBrandId(body.brandId);
        const accountByPlatform = new Map<string, (typeof accounts)[number]>();
        for (const account of accounts) {
            // First connected account per platform wins (matches the single
            // accountId the Publish node payload can express).
            if (!accountByPlatform.has(account.platform)) {
                accountByPlatform.set(account.platform, account);
            }
        }

        // Map each requested channel to a real connected account. Fail clearly
        // (400) when a platform has no connection rather than publishing into
        // the void.
        const platforms: IPlatformConfig[] = [];
        const missing: string[] = [];
        for (const channel of body.channels) {
            const account = accountByPlatform.get(channel as SocialPlatform);
            if (!account) {
                missing.push(channel);
                continue;
            }
            platforms.push({
                accountId: account._id.toString(),
                platform: account.platform,
                platformUsername: account.platformUsername,
            });
        }

        if (missing.length > 0) {
            return NextResponse.json(
                {
                    error: `No connected account for: ${missing.join(', ')}. Connect ${
                        missing.length === 1 ? 'it' : 'them'
                    } in social settings before publishing.`,
                    missingPlatforms: missing,
                },
                { status: 400 }
            );
        }

        const mediaUrls = body.mediaUrl ? [body.mediaUrl] : [];
        const mediaTypes = body.mediaUrl && body.mediaType ? [body.mediaType] : [];

        const result = await submitSocialPost({
            userId: sessionUserId,
            intent: 'publish',
            brandId: body.brandId,
            content: body.caption,
            mediaUrls,
            mediaTypes,
            platforms,
            scheduledFor: new Date(),
            timezone: 'UTC',
        });

        return NextResponse.json({
            success: true,
            id: result.scheduledPost._id.toString(),
            requiresApproval: result.requiresApproval,
        });
    } catch (error) {
        console.error('Failed to create post:', error);
        if (error instanceof z.ZodError) {
            return new NextResponse(JSON.stringify(error.issues), { status: 422 });
        }
        // Brand-access / submission errors thrown by submitSocialPost.
        if (error instanceof Error && /Access denied|not found/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
