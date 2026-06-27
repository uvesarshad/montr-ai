/**
 * Mastodon provider. Wraps publish-to-mastodon-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToMastodon } from '@/ai/flows/publish-to-mastodon-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const caps = mastodonProvider.capabilities;
    // Mastodon supports up to 4 media attachments.
    const mediaUrls = ctx.mediaUrls.slice(0, caps.maxMedia);
    const firstComment = config.firstComment || undefined;

    // ---- Thread chaining: each segment replies to the previous status ----
    if (config.isThread && config.threadParts && config.threadParts.length > 0) {
        let rootPostId: string | undefined;
        let rootPostUrl: string | undefined;
        let inReplyToId: string | undefined;

        for (let i = 0; i < config.threadParts.length; i++) {
            const isFirst = i === 0;
            const result = await publishToMastodon({
                accountId: config.accountId,
                text: config.threadParts[i],
                // Attach media on the first segment only.
                mediaUrls: isFirst ? mediaUrls : [],
                inReplyToId,
                firstComment: i === config.threadParts.length - 1 ? firstComment : undefined,
            });

            if (!result.success) {
                return failResult('mastodon', config.accountId, result.error || 'Failed to publish Mastodon thread');
            }

            if (isFirst) {
                rootPostId = result.postId;
                rootPostUrl = result.postUrl;
            }
            inReplyToId = result.postId;
        }

        return {
            platform: 'mastodon',
            accountId: config.accountId,
            success: true,
            postId: rootPostId,
            postUrl: rootPostUrl,
            publishedAt: new Date(),
        };
    }

    // ---- Single post (text / carousel up to 4) ----
    const result = await publishToMastodon({
        accountId: config.accountId,
        text: content,
        mediaUrls,
        firstComment,
    });

    if (!result.success) {
        return failResult('mastodon', config.accountId, result.error || 'Failed to publish to Mastodon');
    }

    return {
        platform: 'mastodon',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const mastodonProvider: PlatformProvider = {
    platform: 'mastodon',
    displayName: 'Mastodon',
    capabilities: {
        carousel: true,
        maxMedia: 4,
        video: true,
        threads: true,
        firstComment: true,
        reels: false,
        stories: false,
        polls: true,
        analytics: false,
        requiresMedia: false,
        maxLength: 500,
    },
    publish,
};
