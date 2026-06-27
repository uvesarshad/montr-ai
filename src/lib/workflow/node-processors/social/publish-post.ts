import { NodeProcessor, NodeProcessorContext } from '../index';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import brandRepository from '@/lib/db/repository/brand.repository';
import { submitSocialPost } from '@/lib/social/social-post-submissions';
import type { IPlatformConfig } from '@/lib/db/models/scheduled-post.model';

/**
 * Publish to social channels.
 *
 * This node does NOT post directly. It hands off to the real submission
 * pipeline (`submitSocialPost` → BullMQ → per-platform OAuth publishers),
 * honouring the brand's approval policy. It therefore never reports
 * `published`/success for work it hasn't actually performed — it reports the
 * queued/pending-approval state of the submission.
 */
export class SocialPublishProcessor implements NodeProcessor {
    async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
        const { config, execution, workflow, variableResolver } = context;

        // ---- 1. Resolve content + selected channels -------------------------
        const caption = variableResolver.resolve(String(config.caption || ''));
        const mediaUrl = variableResolver.resolve(String(config.mediaUrl || ''));
        const mediaType = String(config.mediaType || 'image') === 'video' ? 'video' : 'image';
        const selectedChannels = (config.selectedChannels as string[] | undefined) || [];

        if (!caption.trim() && !mediaUrl.trim()) {
            throw new Error('Cannot publish an empty post: provide a caption or media.');
        }

        if (!selectedChannels || selectedChannels.length === 0) {
            throw new Error('No social channels selected for publication.');
        }

        const userId = execution.userId.toString();
        const organizationId = execution.userId?.toString();

        // ---- 2. Resolve the brand (never fall back to userId) ---------------
        // Trust order: execution.brandId → workflow.brandId → config.brandId.
        // config.brandId is client-influenced, so it is validated against the
        // execution's organization before use.
        let brandId =
            execution.brandId?.toString() ||
            workflow.brandId?.toString() ||
            undefined;

        if (!brandId && config.brandId) {
            const candidate = String(config.brandId);
            const brand = await brandRepository.findById(candidate);
            if (!brand) {
                throw new Error('Configured brand not found.');
            }
            const brandOrg = brand.userId || null;
            const ownsBrand = brand.userId === userId;
            const sameOrg = Boolean(organizationId && brandOrg && brandOrg === organizationId);
            if (!ownsBrand && !sameOrg) {
                throw new Error('Configured brand does not belong to this workflow\'s organization.');
            }
            brandId = candidate;
        }

        if (!brandId) {
            throw new Error('No brand is associated with this workflow; cannot publish to social.');
        }

        // ---- 3. Resolve real connected accounts for the brand --------------
        const connectedAccounts = await socialAccountRepository.findByBrandId(brandId);

        if (connectedAccounts.length === 0) {
            throw new Error('No social accounts are connected for this brand. Connect an account first.');
        }

        const connectedPlatforms = Array.from(new Set(connectedAccounts.map((a) => a.platform)));

        // Map each requested channel to a connected account (first active match).
        const platforms: IPlatformConfig[] = [];
        const unmatched: string[] = [];

        for (const channel of selectedChannels) {
            const account = connectedAccounts.find((a) => a.platform === channel);
            if (!account) {
                unmatched.push(channel);
                continue;
            }

            const platformConfig: IPlatformConfig = {
                accountId: account._id.toString(),
                platform: account.platform,
                platformUsername: account.platformUsername,
            };

            // Telegram requires explicit target chats — use all known channels.
            if (account.platform === 'telegram' && account.telegramChannels?.length) {
                platformConfig.telegramChatIds = account.telegramChannels.map((c) => c.chatId);
            }

            platforms.push(platformConfig);
        }

        if (platforms.length === 0) {
            throw new Error(
                `None of the selected channels (${selectedChannels.join(', ')}) are connected for this brand. ` +
                `Connected platforms: ${connectedPlatforms.join(', ') || 'none'}.`
            );
        }

        // Dry-run (1.9): simulate the submission — no scheduled post, no queue.
        if (context.dryRun) {
            return {
                simulated: true,
                published: false,
                wouldPublish: {
                    caption,
                    mediaUrl,
                    channels: platforms.map((p) => p.platform),
                },
                skippedChannels: unmatched,
            };
        }

        // ---- 4. Hand off to the real submission pipeline -------------------
        const { scheduledPost, requiresApproval } = await submitSocialPost({
            userId,
            intent: 'publish',
            brandId,
            content: caption,
            mediaUrls: mediaUrl ? [mediaUrl] : [],
            mediaTypes: mediaUrl ? [mediaType] : [],
            platforms,
            scheduledFor: new Date(), // publish immediately
            timezone: 'UTC',
        });

        // ---- 5. Honest status semantics -----------------------------------
        // requiresApproval → 'pending_approval' (awaiting a human).
        // otherwise        → 'queued' (enqueued on BullMQ; publishers run async).
        // Never 'published': nothing is published synchronously here.
        const status = requiresApproval ? 'pending_approval' : 'queued';

        return {
            status,
            requiresApproval,
            published: false,
            postId: scheduledPost._id.toString(),
            postStatus: scheduledPost.status,
            channels: platforms.map((p) => p.platform),
            skippedChannels: unmatched,
            caption,
            mediaUrl,
        };
    }
}
