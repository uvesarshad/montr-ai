/**
 * Dribbble provider. Wraps publish-to-dribbble-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToDribbble } from '@/ai/flows/publish-to-dribbble-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';

    if (!mediaUrl) {
        return failResult('dribbble', config.accountId, 'Dribbble requires an image');
    }
    if (primaryMediaType === 'video') {
        return failResult('dribbble', config.accountId, 'Dribbble video publishing is not supported');
    }

    const title = content.split('\n')[0].slice(0, 100);
    const result = await publishToDribbble({
        title,
        description: content,
        imageUrl: mediaUrl,
        socialAccountId: config.accountId,
    });

    return {
        platform: 'dribbble',
        accountId: config.accountId,
        success: true,
        postId: result.shotId.toString(),
        postUrl: result.shotUrl,
        publishedAt: new Date(),
    };
}

export const dribbbleProvider: PlatformProvider = {
    platform: 'dribbble',
    displayName: 'Dribbble',
    capabilities: {
        carousel: false,
        maxMedia: 1,
        video: false,
        threads: false,
        firstComment: false,
        reels: false,
        stories: false,
        polls: false,
        analytics: false,
        requiresMedia: true,
        maxLength: 1000,
    },
    publish,
};
