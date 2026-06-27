import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { CreateScheduledPostInput } from '@/lib/db/repository/scheduled-post.repository';
import { IPlatformConfig } from '@/lib/db/models/scheduled-post.model';
import { submitSocialPost } from '@/lib/social/social-post-submissions';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';



const platformSchema = z.object({
    accountId: z.string(),
    platform: z.string(),
    platformUsername: z.string(),
    telegramChatIds: z.array(z.string()).optional(),
    redditSubreddit: z.string().optional(),
    redditTitle: z.string().optional(),
    pinterestBoardId: z.string().optional(),
    instagramFirstComment: z.string().optional(),
    isThread: z.boolean().optional(),
    threadParts: z.array(z.string()).optional(),
    firstComment: z.string().optional(),
    settings: z.record(z.unknown()).optional(),
});

const recurrenceSchema = z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).optional(),
    endDate: z.string().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
});

const scheduleBodySchema = z.object({
    intent: z.enum(['schedule', 'publish']).optional(),
    brandId: z.string().min(1), // ignored — re-derived from session
    content: z.string().min(1),
    mediaUrls: z.array(z.string()).optional(),
    mediaTypes: z.array(z.enum(['image', 'video'])).optional(),
    altText: z.string().optional(),
    postFormat: z.enum(['standard', 'reel']).optional(),
    platforms: z.array(platformSchema).min(1),
    scheduledFor: z.string().optional(),
    timezone: z.string().optional(),
    recurrence: recurrenceSchema.optional(),
    bulk: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = scheduleBodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Missing required fields: brandId, content, platforms' },
                { status: 400 }
            );
        }

        const {
            intent,
            brandId,
            content,
            mediaUrls,
            mediaTypes,
            altText,
            postFormat,
            platforms,
            scheduledFor,
            timezone,
            recurrence,
            bulk,
        } = parsed.data;

        // Validation
        const submissionIntent = intent === 'publish' ? 'publish' : 'schedule';

        const scheduledDate = submissionIntent === 'publish'
            ? new Date(scheduledFor || new Date().toISOString())
            : new Date(scheduledFor || '');
        if (isNaN(scheduledDate.getTime())) {
            return NextResponse.json(
                { error: 'Invalid scheduledFor date' },
                { status: 400 }
            );
        }

        if (submissionIntent === 'schedule' && scheduledDate <= new Date()) {
            return NextResponse.json(
                { error: 'scheduledFor must be in the future' },
                { status: 400 }
            );
        }

        // Tenancy: re-derive brand ownership from the session user (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Plan enforcement (audit B3). Org-less personal accounts are not capped.
        // Validate platform configs
        const validatedPlatforms: IPlatformConfig[] = platforms.map((p) => ({
            accountId: p.accountId,
            platform: p.platform,
            platformUsername: p.platformUsername,
            telegramChatIds: p.telegramChatIds,
            redditSubreddit: p.redditSubreddit,
            redditTitle: p.redditTitle,
            pinterestBoardId: p.pinterestBoardId,
            instagramFirstComment: p.instagramFirstComment,
            isThread: p.isThread,
            threadParts: p.threadParts,
            firstComment: p.firstComment,
            settings: p.settings,
        }));

        const { scheduledPost, requiresApproval } = await submitSocialPost({
            userId: session.user.id,
            intent: submissionIntent,
            brandId,
            content,
            mediaUrls: mediaUrls || [],
            mediaTypes: mediaTypes || [],
            altText,
            postFormat: postFormat || 'standard',
            platforms: validatedPlatforms,
            scheduledFor: scheduledDate,
            timezone: timezone || 'UTC',
            recurrence: recurrence
                ? ({
                    ...recurrence,
                    interval: recurrence.interval ?? 1,
                    endDate: recurrence.endDate ? new Date(recurrence.endDate) : undefined,
                } as CreateScheduledPostInput['recurrence'])
                : undefined,
        });

        return NextResponse.json({
            success: true,
            requiresApproval,
            scheduledPost: {
                id: scheduledPost._id,
                status: scheduledPost.status,
                scheduledFor: scheduledPost.scheduledFor,
                platforms: scheduledPost.platforms.length,
            },
            message: requiresApproval
                ? 'Submitted to admin for approval.'
                : submissionIntent === 'publish'
                    ? 'Queued for publishing.'
                    : 'Scheduled successfully.',
        });
    } catch (error: unknown) {
        console.error('Error scheduling post:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to schedule post' },
            { status: 500 }
        );
    }
}
