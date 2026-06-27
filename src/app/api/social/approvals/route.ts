import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { postApprovalRepository } from '@/lib/db/repository/post-approval.repository';
import { activityLogRepository } from '@/lib/db/repository/activity-log.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { activateApprovedSocialPost, cancelRejectedSocialPost } from '@/lib/social/social-post-submissions';

/**
 * GET /api/social/approvals
 * List pending approvals for organization (admin only)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Must be in an organization and be admin
        if (!user) {
            return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
        }

        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
        const brandId = searchParams.get('brandId');

        const filters = {
            ...(status && { status }),
            ...(brandId && { brandId }),
        };

        const approvals = await postApprovalRepository.find(filters);
        const stats = await postApprovalRepository.getStats();

        // Enrich each approval with a compact preview of its underlying post,
        // plus the submitter name and brand name — so admins can review in
        // context instead of approving against a truncated post id (audit C8 §A6).
        // All lookups are org-scoped: brands are loaded from the admin's own
        // organization and post ids come from approvals already filtered by org.
        const scheduledIds = Array.from(
            new Set(
                approvals
                    .filter((a) => a.postType === 'scheduled')
                    .map((a) => a.postId),
            ),
        );
        const submitterIds = Array.from(new Set(approvals.map((a) => a.submittedBy)));

        const [scheduledPosts, submitters, orgBrands] = await Promise.all([
            scheduledPostRepository.findByIds(scheduledIds),
            userRepository.findByIds(submitterIds),
            brandRepository.findByOrganizationId(),
        ]);

        const postById = new Map(scheduledPosts.map((p) => [p._id.toString(), p]));
        const submitterById = new Map(submitters.map((u) => [u._id.toString(), u]));
        const brandById = new Map(orgBrands.map((b) => [b._id.toString(), b]));

        const enriched = approvals.map((approval) => {
            const obj = approval.toObject();
            const submitter = submitterById.get(approval.submittedBy);
            const brand = brandById.get(approval.brandId);

            let post: {
                content: string;
                mediaUrls: string[];
                mediaTypes: ('image' | 'video')[];
                platforms: Array<{ platform: string; platformUsername: string }>;
                scheduledFor: Date;
                timezone: string;
            } | null = null;

            if (approval.postType === 'scheduled') {
                const sp = postById.get(approval.postId);
                // Only attach posts that belong to the admin's organization.
                if (sp && sp.userId === user.id!) {
                    post = {
                        content: sp.content,
                        mediaUrls: sp.mediaUrls || [],
                        mediaTypes: sp.mediaTypes || [],
                        platforms: (sp.platforms || []).map((pl) => ({
                            platform: pl.platform,
                            platformUsername: pl.platformUsername,
                        })),
                        scheduledFor: sp.scheduledFor,
                        timezone: sp.timezone,
                    };
                }
            }

            const submitterName =
                submitter?.name ||
                [submitter?.firstName, submitter?.lastName].filter(Boolean).join(' ').trim() ||
                submitter?.email ||
                undefined;

            return {
                ...obj,
                post,
                submitterName,
                brandName: brand?.name,
            };
        });

        return NextResponse.json({ approvals: enriched, stats });
    } catch (error) {
        console.error('Error fetching approvals:', error);
        return NextResponse.json(
            { error: 'Failed to fetch approvals' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/social/approvals
 * Submit a post for approval
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!user) {
            return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
        }

        const body = await request.json();
        const { postId, postType, brandId } = body;

        if (!postId || !postType || !brandId) {
            return NextResponse.json(
                { error: 'Missing required fields: postId, postType, brandId' },
                { status: 400 }
            );
        }

        const approval = await postApprovalRepository.create({
            postId,
            postType,
            brandId,
            submittedBy: user._id.toString(),
        });

        // Log activity
        await activityLogRepository.log({
            brandId,
            userId: user._id.toString(),
            userName: user.name,
            action: 'post_submitted',
            targetType: 'approval',
            targetId: approval._id.toString(),
            metadata: { postId, postType },
        });

        return NextResponse.json({ approval }, { status: 201 });
    } catch (error) {
        console.error('Error submitting for approval:', error);
        const message = error instanceof Error ? error.message : 'Failed to submit for approval';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * PATCH /api/social/approvals
 * Approve or reject a post (admin only)
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const { approvalId, action, reviewNote } = body;

        if (!approvalId || !action || !['approve', 'reject'].includes(action)) {
            return NextResponse.json(
                { error: 'Missing or invalid fields: approvalId, action (approve/reject)' },
                { status: 400 }
            );
        }

        if (action === 'reject' && !reviewNote) {
            return NextResponse.json(
                { error: 'Review note required when rejecting' },
                { status: 400 }
            );
        }

        // Get approval to verify organization
        const existing = await postApprovalRepository.findById(approvalId);
        if (!existing) {
            return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
        }
        let approval;
        let revisionDraftId: string | null = null;
        if (action === 'approve') {
            approval = await postApprovalRepository.approve(approvalId, user._id.toString(), reviewNote);
            if (existing.postType === 'scheduled') {
                await activateApprovedSocialPost(existing.postId);
            }
        } else {
            approval = await postApprovalRepository.reject(approvalId, user._id.toString(), reviewNote);
            if (existing.postType === 'scheduled') {
                const { revisionDraft } = await cancelRejectedSocialPost(existing.postId);
                revisionDraftId = revisionDraft ? revisionDraft._id.toString() : null;
            }
        }

        // Notify the submitter of the decision (audit C8 §A4). Best-effort.
        try {
            const { notifyUser } = await import('@/lib/notifications/notification-service');
            const approved = action === 'approve';
            await notifyUser(existing.submittedBy, {
                type: approved ? 'social_post_approved' : 'social_post_rejected',
                title: approved ? 'Your post was approved' : 'Your post was rejected',
                body: approved
                    ? `${user.name || 'An admin'} approved your post — it is now scheduled.${reviewNote ? ` Note: ${reviewNote}` : ''}`
                    : `${user.name || 'An admin'} rejected your post.${reviewNote ? ` Note: ${reviewNote}` : ''} It was reopened as a draft so you can revise and resubmit.`,
                actionUrl: approved
                    ? '/social/calendar'
                    : revisionDraftId
                        ? `/social/create-post?draftId=${revisionDraftId}`
                        : '/social/drafts',
                actionLabel: approved ? 'View calendar' : 'Revise draft',
                dedupeKey: `social-approval-decision:${approvalId}`,
                data: {
                    postId: existing.postId,
                    approvalId,
                    decision: action,
                    reviewNote: reviewNote || null,
                    revisionDraftId,
                },
            });
        } catch (notifyError) {
            console.error('Failed to notify submitter of approval decision:', notifyError);
        }

        // Log activity
        await activityLogRepository.log({
            brandId: existing.brandId,
            userId: user._id.toString(),
            userName: user.name,
            action: action === 'approve' ? 'post_approved' : 'post_rejected',
            targetType: 'approval',
            targetId: approvalId,
            metadata: { postId: existing.postId, postType: existing.postType, reviewNote },
        });

        return NextResponse.json({ approval });
    } catch (error) {
        console.error('Error processing approval:', error);
        return NextResponse.json(
            { error: 'Failed to process approval' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/social/approvals
 * Cancel a submission (by submitter only)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const approvalId = searchParams.get('id');

        if (!approvalId) {
            return NextResponse.json({ error: 'Approval ID required' }, { status: 400 });
        }

        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const existing = await postApprovalRepository.findById(approvalId);
        if (!existing) {
            return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
        }

        const approval = await postApprovalRepository.cancel(approvalId, user._id.toString());
        if (!approval) {
            return NextResponse.json(
                { error: 'Cannot cancel - not your submission or already processed' },
                { status: 403 }
            );
        }

        // Log activity
        await activityLogRepository.log({
            brandId: existing.brandId,
            userId: user._id.toString(),
            userName: user.name,
            action: 'post_cancelled',
            targetType: 'approval',
            targetId: approvalId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error cancelling approval:', error);
        return NextResponse.json(
            { error: 'Failed to cancel approval' },
            { status: 500 }
        );
    }
}
