import BrandContext from '@/lib/db/models/brand-context.model';
import Organization from '@/lib/db/models/organization.model';
import type { CreateScheduledPostInput } from '@/lib/db/repository/scheduled-post.repository';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { postApprovalRepository } from '@/lib/db/repository/post-approval.repository';
import { activityLogRepository } from '@/lib/db/repository/activity-log.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { draftRepository } from '@/lib/db/repository/draft.repository';
import brandRepository from '@/lib/db/repository/brand.repository';
import { schedulePost } from '@/lib/queue';
import { resolveSocialSubmissionDecision } from '@/lib/social/post-submission';
import { hasSocialPlanFeature } from '@/lib/social/plan-limits';

export interface SubmitSocialPostInput {
  userId: string;
  intent: 'schedule' | 'publish';
  brandId: string;
  content: string;
  mediaUrls?: string[];
  mediaTypes?: ('image' | 'video')[];
  altText?: string;
  postFormat?: 'standard' | 'reel';
  platforms: CreateScheduledPostInput['platforms'];
  scheduledFor: Date;
  timezone: string;
  recurrence?: CreateScheduledPostInput['recurrence'];
}

async function getSubmissionContext(
  userId: string,
  brandId: string,
  intent: 'schedule' | 'publish',
) {
  const [user, brand, brandContext] = await Promise.all([
    userRepository.findById(userId),
    brandRepository.findById(brandId),
    BrandContext.findOne({ brandId }),
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  if (!brand) {
    throw new Error('Brand not found');
  }

  const canAccessBrand =
    brand.userId === userId ||
    Boolean(user.id && brand.userId && user.id! === brand.userId);

  if (!canAccessBrand) {
    throw new Error('Access denied for this brand');
  }

  const organizationId = brand.userId || user.id || null;

  // Org-wide approval policy (audit C8) — the floor under any brand override.
  const organization = organizationId ? await Organization.findById(organizationId) : null;
  const decision = resolveSocialSubmissionDecision({
    orgPolicy: organization?.socialApprovalPolicy ?? null,
    brandRequireApproval: brandContext?.requireApproval || [],
    userRole: user.role,
    intent,
  });

  // The *ability* to use the approval workflow is a plan feature (audit C9 —
  // `allowApprovalWorkflow`, set by super admin). When the plan doesn't allow
  // it, submissions go straight through so a downgrade can't strand posts in
  // `pending_approval` with no working queue.
  let requiresApproval = Boolean(organizationId && decision.requiresApproval);
  if (requiresApproval && organizationId) {
    const planAllows = await hasSocialPlanFeature(organizationId, 'allowApprovalWorkflow');
    if (!planAllows) requiresApproval = false;
  }

  return {
    user,
    brand,
    requiresApproval,
    shouldQueueImmediately: !requiresApproval,
    initialStatus: requiresApproval ? ('pending_approval' as const) : ('scheduled' as const),
  };
}

export async function submitSocialPost(input: SubmitSocialPostInput) {
  const context = await getSubmissionContext(input.userId, input.brandId, input.intent);

  const scheduledPost = await scheduledPostRepository.create({
    brandId: input.brandId,
    userId: input.userId,
    content: input.content,
    mediaUrls: input.mediaUrls || [],
    mediaTypes: input.mediaTypes || [],
    altText: input.altText,
    postFormat: input.postFormat || 'standard',
    platforms: input.platforms,
    scheduledFor: input.scheduledFor,
    timezone: input.timezone,
    recurrence: input.recurrence,
    status: context.initialStatus,
  });

  if (context.requiresApproval) {
    await postApprovalRepository.create({
      postId: scheduledPost._id.toString(),
      postType: 'scheduled',
      brandId: input.brandId,
      submittedBy: context.user._id.toString(),
    });

    await activityLogRepository.log({
      brandId: input.brandId,
      userId: context.user._id.toString(),
      userName: context.user.name,
      action: 'post_submitted',
      targetType: 'approval',
      targetId: scheduledPost._id.toString(),
      metadata: {
        postId: scheduledPost._id.toString(),
        postType: 'scheduled',
        intent: input.intent,
      },
    });

    // In-app notification to org admins (audit C8 §A3 — the core of the ask).
    // Best-effort: a notification failure must not fail the submission.
    try {
      const { notifyAdmins } = await import('@/lib/notifications/notification-service');
      const platformList = [...new Set(input.platforms.map((p) => p.platform))].join(', ');
      await notifyAdmins({
        type: 'social_post_pending_approval',
        title: 'Post awaiting approval',
        body: `${context.user.name || 'A member'} submitted a ${context.brand.name} post for ${platformList || 'social'} — review it in the approval queue.`,
        actionUrl: `/social/approvals?postId=${scheduledPost._id.toString()}`,
        actionLabel: 'Review post',
        dedupeKey: `social-approval:${scheduledPost._id.toString()}`,
        data: {
          postId: scheduledPost._id.toString(),
          brandId: input.brandId,
          submittedBy: context.user._id.toString(),
          platforms: input.platforms.map((p) => p.platform),
          scheduledFor: input.scheduledFor,
        },
      });
    } catch (err) {
      console.error('[social] Failed to notify admins of pending approval:', err);
    }

    return {
      scheduledPost,
      requiresApproval: true,
    };
  }

  await schedulePost(scheduledPost._id.toString(), input.scheduledFor);

  await activityLogRepository.log({
          brandId: input.brandId,
          userId: context.user._id.toString(),
          userName: context.user.name,
          action: 'post_scheduled',
          targetType: 'scheduled_post',
          targetId: scheduledPost._id.toString(),
          targetName: input.intent === 'publish' ? 'Queued for publishing' : 'Scheduled post',
          metadata: {
            intent: input.intent,
            scheduledFor: input.scheduledFor,
          },
        });

  return {
    scheduledPost,
    requiresApproval: false,
  };
}

export async function activateApprovedSocialPost(postId: string) {
  const post = await scheduledPostRepository.findById(postId);
  if (!post || post.status !== 'pending_approval') {
    return post;
  }

  const activatedPost = await scheduledPostRepository.setStatus(postId, 'scheduled');
  if (!activatedPost) {
    return null;
  }

  await schedulePost(activatedPost._id.toString(), activatedPost.scheduledFor);
  return activatedPost;
}

/**
 * Cancel a rejected post and reopen it as an editable draft so the submitter
 * can revise + resubmit (audit C8 §A4 — revision loop). Returns the cancelled
 * post and, when one could be created, the revision draft.
 */
export async function cancelRejectedSocialPost(postId: string) {
  const post = await scheduledPostRepository.findById(postId);
  if (!post || post.status !== 'pending_approval') {
    return { post, revisionDraft: null };
  }

  const cancelled = await scheduledPostRepository.setStatus(postId, 'cancelled');

  // Reopen as a draft (best-effort): the submitter edits the draft and
  // resubmits through the normal flow.
  let revisionDraft = null;
  try {
    revisionDraft = await draftRepository.create({
      brandId: post.brandId,
      userId: post.userId,
      content: post.content,
      media: (post.mediaUrls || []).map((url, i) => ({
        id: `${postId}-media-${i}`,
        url,
        type: post.mediaTypes?.[i] || 'image',
      })),
      platforms: post.platforms.map((p) => ({
        accountId: p.accountId,
        platform: p.platform,
        platformUsername: p.platformUsername,
        telegramChatIds: p.telegramChatIds,
        redditSubreddit: p.redditSubreddit,
        redditTitle: p.redditTitle,
      })),
    });
  } catch (err) {
    console.error('[social] Failed to create revision draft for rejected post:', err);
  }

  return { post: cancelled, revisionDraft };
}
