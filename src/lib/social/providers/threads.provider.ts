/**
 * Threads provider. Wraps publish-to-threads-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToThreads } from '@/ai/flows/publish-to-threads-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const caps = threadsProvider.capabilities;
    // Carousel: up to maxMedia items in order.
    const mediaUrls = ctx.mediaUrls.slice(0, caps.maxMedia);
    const mediaTypes = (ctx.mediaTypes || []).slice(0, caps.maxMedia);
    const firstComment = config.firstComment || undefined;

    // ---- Thread chaining: publish each segment, chaining replies ----
    if (config.isThread && config.threadParts && config.threadParts.length > 0) {
        let rootPostId: string | undefined;
        let rootPostUrl: string | undefined;
        let replyToId: string | undefined;

        for (let i = 0; i < config.threadParts.length; i++) {
            const isFirst = i === 0;
            const result = await publishToThreads({
                accountId: config.accountId,
                text: config.threadParts[i],
                // Attach all media on the first segment only.
                mediaUrls: isFirst ? mediaUrls : [],
                mediaTypes: isFirst ? mediaTypes : [],
                replyToId,
                // First comment goes on the final segment.
                firstComment: i === config.threadParts.length - 1 ? firstComment : undefined,
            });

            if (!result.success) {
                return failResult('threads', config.accountId, result.error || 'Failed to publish Threads thread');
            }

            if (isFirst) {
                rootPostId = result.postId;
                rootPostUrl = result.postUrl;
            }
            replyToId = result.postId;
        }

        return {
            platform: 'threads',
            accountId: config.accountId,
            success: true,
            postId: rootPostId,
            postUrl: rootPostUrl,
            publishedAt: new Date(),
        };
    }

    // ---- Single post (text / single media / carousel) ----
    const result = await publishToThreads({
        accountId: config.accountId,
        text: content,
        mediaUrls,
        mediaTypes,
        firstComment,
    });

    if (!result.success) {
        return failResult('threads', config.accountId, result.error || 'Failed to publish to Threads');
    }

    return {
        platform: 'threads',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const threadsProvider: PlatformProvider = {
    platform: 'threads',
    displayName: 'Threads',
    capabilities: {
        carousel: true,
        maxMedia: 10,
        video: true,
        threads: true,
        firstComment: true,
        reels: false,
        stories: false,
        polls: false,
        analytics: true,
        requiresMedia: false,
        maxLength: 500,
    },
    publish,
};
