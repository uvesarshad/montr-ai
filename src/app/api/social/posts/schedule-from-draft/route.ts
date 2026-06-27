import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { draftRepository } from '@/lib/db/repository/draft.repository';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { activityLogRepository } from '@/lib/db/repository/activity-log.repository';
import { schedulePost } from '@/lib/queue';

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong';

// POST - Schedule a draft onto a specific date
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { draftId, scheduledFor, timezone } = body;

        if (!draftId || !scheduledFor) {
            return NextResponse.json(
                { error: 'draftId and scheduledFor are required' },
                { status: 400 }
            );
        }

        const draft = await draftRepository.findById(draftId);
        
        if (!draft) {
            return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
        }
        
        if (draft.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (!draft.platforms || draft.platforms.length === 0) {
            return NextResponse.json(
                { error: 'Draft has no assigned platforms. Cannot schedule.' },
                { status: 400 }
            );
        }

        const existingScheduledPosts = await scheduledPostRepository.findActiveBySourceDraftIds(
            [draftId],
            session.user.id,
        );

        if (existingScheduledPosts.length > 0) {
            return NextResponse.json(
                { error: 'This draft is already scheduled' },
                { status: 400 }
            );
        }

        const scheduledDate = new Date(scheduledFor);
        if (isNaN(scheduledDate.getTime())) {
            return NextResponse.json({ error: 'Invalid scheduledFor date' }, { status: 400 });
        }
        if (scheduledDate <= new Date()) {
            return NextResponse.json(
                { error: 'scheduledFor must be in the future' },
                { status: 400 }
            );
        }

        const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Create the scheduled post from the draft
        const scheduledPost = await scheduledPostRepository.create({
            brandId: draft.brandId,
            userId: session.user.id,
            sourceDraftId: draftId,
            content: draft.content,
            mediaUrls: draft.media.map((m) => m.url),
            platforms: draft.platforms,
            scheduledFor: scheduledDate,
            timezone: resolvedTimezone,
        });

        // Add the post to the queue
        await schedulePost(scheduledPost._id.toString(), scheduledDate);
        await draftRepository.incrementScheduleCount(draftId, session.user.id!);

        const user = await userRepository.findById(session.user.id!);
        if (user && user.id) {
            await activityLogRepository.log({
                brandId: draft.brandId,
                userId: user._id.toString(),
                userName: user.name,
                action: 'post_scheduled',
                targetType: 'scheduled_post',
                targetId: scheduledPost._id.toString(),
                targetName: draft.title || 'Untitled Post',
                metadata: { scheduledFor: scheduledDate },
            });
        }

        return NextResponse.json({
            success: true,
            post: {
                id: scheduledPost._id,
                brandId: scheduledPost.brandId,
                status: scheduledPost.status,
                scheduledFor: scheduledPost.scheduledFor,
            },
        });
    } catch (error: unknown) {
        console.error('Error scheduling post from draft:', error);
        return NextResponse.json(
            { error: getErrorMessage(error) || 'Failed to schedule post from draft' },
            { status: 500 }
        );
    }
}
