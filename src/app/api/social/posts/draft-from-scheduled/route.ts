import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { draftRepository } from '@/lib/db/repository/draft.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { activityLogRepository } from '@/lib/db/repository/activity-log.repository';
import { cancelScheduledPost } from '@/lib/queue';

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong';

// POST - Convert a scheduled post back to a draft
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { postId } = body;

        if (!postId) {
            return NextResponse.json(
                { error: 'postId is required' },
                { status: 400 }
            );
        }

        // 1. Find the scheduled post
        const post = await scheduledPostRepository.findById(postId);
        
        if (!post) {
            return NextResponse.json({ error: 'Scheduled post not found' }, { status: 404 });
        }

        // Verify ownership
        if (post.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Ensure it's actually scheduled (not already published or failed)
        if (post.status !== 'scheduled') {
             return NextResponse.json({ error: 'Only pending scheduled posts can be converted to drafts' }, { status: 400 });
        }

        // 2. Reuse the source draft when available, otherwise create a fallback draft
        let draft = null;
        let draftTitle = `Draft from: ${post.content.substring(0, 30)}...`;

        if (post.sourceDraftId) {
            draft = await draftRepository.findById(post.sourceDraftId);
            if (draft && draft.userId !== session.user.id) {
                draft = null;
            }
        }

        if (!draft) {
            const newDraftData = {
                brandId: post.brandId,
                userId: session.user.id,
                title: draftTitle,
                content: post.content,
                media: post.mediaUrls ? post.mediaUrls.map((url: string) => ({
                    id: crypto.randomUUID(),
                    url,
                    type: (url.match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image') as 'video' | 'image'
                })) : [],
                platforms: post.platforms,
                scheduleCount: 1,
            };

            draft = await draftRepository.create(newDraftData);
        } else {
            draftTitle = draft.title;
        }

        // 3. Cancel the BullMQ job for this post
        await cancelScheduledPost(postId);

        // 4. Delete the scheduled post from the database
        await scheduledPostRepository.delete(postId);

        // 5. Log activities
        const user = await userRepository.findById(session.user.id!);
        if (user && user.id) {
            // Log that post was cancelled
            await activityLogRepository.log({
                brandId: post.brandId,
                    userId: user._id.toString(),
                    userName: user.name,
                    action: 'post_cancelled',
                    targetType: 'scheduled_post',
                    targetId: postId,
                    targetName: draftTitle,
                    metadata: { reason: 'converted_to_draft' },
                });

            // Log that draft was created
            await activityLogRepository.log({
                    brandId: draft.brandId,
                userId: user._id.toString(),
                userName: user.name,
                action: 'draft_saved',
                targetType: 'draft',
                targetId: draft._id.toString(),
                targetName: draft.title,
                metadata: { type: post.sourceDraftId ? 'restore_from_scheduled' : 'create_from_scheduled' },
            });
        }

        return NextResponse.json({
            success: true,
            draft: {
                id: draft._id,
                title: draft.title,
            },
            message: 'Post successfully converted to draft'
        });

    } catch (error: unknown) {
        console.error('Error converting scheduled post to draft:', error);
        return NextResponse.json(
            { error: getErrorMessage(error) || 'Failed to convert post to draft' },
            { status: 500 }
        );
    }
}
