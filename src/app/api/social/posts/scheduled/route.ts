import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { activityLogRepository } from '@/lib/db/repository/activity-log.repository';
import { cancelScheduledPost, reschedulePost } from '@/lib/queue';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

// GET - List scheduled posts for a brand or user
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const status = searchParams.get('status');
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');

        const filters: Record<string, unknown> = {};

        if (status) {
            const statuses = status.split(',');
            filters.status = statuses.length > 1 ? statuses : status;
        }

        if (fromDate) {
            filters.fromDate = new Date(fromDate);
        }

        if (toDate) {
            filters.toDate = new Date(toDate);
        }

        let posts;
        if (brandId) {
            // Tenancy: confirm the brand belongs to the caller (audit C4).
            try {
                await assertBrandAccess(session.user.id, brandId);
            } catch (err) {
                if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
                throw err;
            }
            posts = await scheduledPostRepository.findByBrand(brandId, filters);
        } else {
            posts = await scheduledPostRepository.findByUser(session.user.id!, filters);
        }

        return NextResponse.json({
            posts: posts.map(p => ({
                id: p._id,
                brandId: p.brandId,
                content: p.content,
                mediaUrls: p.mediaUrls,
                platforms: p.platforms,
                scheduledFor: p.scheduledFor,
                timezone: p.timezone,
                status: p.status,
                publishResults: p.publishResults,
                createdAt: p.createdAt,
            })),
        });
    } catch (error) {
        console.error('Error fetching scheduled posts:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch scheduled posts' },
            { status: 500 }
        );
    }
}

// PATCH - Update a scheduled post
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, content, mediaUrls, altText, platforms, scheduledFor, timezone } = body;

        if (!id) {
            return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
        }

        // Check if user owns this post
        const existingPost = await scheduledPostRepository.findById(id);
        if (!existingPost) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (existingPost.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        if (existingPost.status !== 'scheduled') {
            return NextResponse.json(
                { error: 'Can only edit posts that are still scheduled' },
                { status: 400 }
            );
        }

        const updates: Record<string, unknown> = {};
        if (content !== undefined) updates.content = content;
        if (mediaUrls !== undefined) updates.mediaUrls = mediaUrls;
        if (altText !== undefined) updates.altText = altText;
        if (platforms !== undefined) updates.platforms = platforms;
        if (timezone !== undefined) updates.timezone = timezone;

        // Handle reschedule
        if (scheduledFor) {
            const newDate = new Date(scheduledFor);
            if (isNaN(newDate.getTime())) {
                return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
            }
            if (newDate <= new Date()) {
                return NextResponse.json(
                    { error: 'scheduledFor must be in the future' },
                    { status: 400 }
                );
            }
            updates.scheduledFor = newDate;

            // Update job in queue
            await reschedulePost(id, newDate);
        }

        const updatedPost = await scheduledPostRepository.update(id, updates);

        if (updatedPost && scheduledFor) {
            const user = await userRepository.findById(session.user.id!);
            if (user && user.id) {
                await activityLogRepository.log({
                    brandId: updatedPost.brandId,
                    userId: user._id.toString(),
                    userName: user.name,
                    action: 'post_scheduled',
                    targetType: 'scheduled_post',
                    targetId: updatedPost._id.toString(),
                    targetName: `Rescheduled post`,
                    metadata: { type: 'reschedule', oldDate: existingPost.scheduledFor, newDate: updates.scheduledFor },
                });
            }
        }

        return NextResponse.json({
            success: true,
            post: updatedPost ? {
                id: updatedPost._id,
                status: updatedPost.status,
                scheduledFor: updatedPost.scheduledFor,
            } : null,
        });
    } catch (error) {
        console.error('Error updating scheduled post:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to update post' },
            { status: 500 }
        );
    }
}

// DELETE - Cancel a scheduled post
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
        }

        // Check if user owns this post
        const existingPost = await scheduledPostRepository.findById(id);
        if (!existingPost) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (existingPost.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Cancel job in queue
        await cancelScheduledPost(id);

        // Cancel in database
        const cancelledPost = await scheduledPostRepository.cancel(id);

        if (cancelledPost) {
            const user = await userRepository.findById(session.user.id!);
            if (user && user.id) {
                await activityLogRepository.log({
                    brandId: existingPost.brandId,
                    userId: user._id.toString(),
                    userName: user.name,
                    action: 'post_cancelled',
                    targetType: 'scheduled_post',
                    targetId: id,
                    targetName: `Cancelled post`,
                    metadata: { reason: 'user_cancelled' },
                });
            }
        }

        return NextResponse.json({
            success: true,
            cancelled: !!cancelledPost,
        });
    } catch (error) {
        console.error('Error cancelling scheduled post:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to cancel post' },
            { status: 500 }
        );
    }
}
