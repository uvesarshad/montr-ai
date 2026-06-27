/**
 * Bluesky provider. Wraps publish-to-bluesky-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToBluesky } from '@/ai/flows/publish-to-bluesky-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';

    const result = await publishToBluesky({
        accountId: config.accountId,
        text: content,
        mediaUrl: mediaUrl && primaryMediaType === 'image' ? mediaUrl : undefined,
    });

    if (!result.success) {
        return failResult('bluesky', config.accountId, result.error || 'Failed to publish to Bluesky');
    }

    return {
        platform: 'bluesky',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const blueskyProvider: PlatformProvider = {
    platform: 'bluesky',
    displayName: 'Bluesky',
    capabilities: {
        carousel: true,
        maxMedia: 4,
        video: false,
        threads: true,
        firstComment: true,
        reels: false,
        stories: false,
        polls: false,
        analytics: false,
        requiresMedia: false,
        maxLength: 300,
    },
    publish,
};
