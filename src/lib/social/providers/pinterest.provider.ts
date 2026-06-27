/**
 * Pinterest provider. Wraps publish-to-pinterest-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToPinterest } from '@/ai/flows/publish-to-pinterest-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';

    if (!mediaUrl) {
        return failResult('pinterest', config.accountId, 'Pinterest requires an image');
    }
    if (primaryMediaType === 'video') {
        return failResult('pinterest', config.accountId, 'Pinterest video publishing is not supported');
    }
    if (!config.pinterestBoardId) {
        return failResult('pinterest', config.accountId, 'Pinterest requires a board (config.pinterestBoardId)');
    }

    const s = (config.settings ?? {}) as Record<string, unknown>;
    const title = (typeof s.title === 'string' && s.title ? s.title : content.split('\n')[0]).slice(0, 100);

    const result = await publishToPinterest({
        accountId: config.accountId,
        title,
        description: content,
        imageUrl: mediaUrl,
        boardId: config.pinterestBoardId,
        link: typeof s.link === 'string' ? s.link : undefined,
        altText: typeof s.altText === 'string' ? s.altText : undefined,
        dominantColor: typeof s.dominantColor === 'string' ? s.dominantColor : undefined,
    });

    if (!result.success) {
        return failResult('pinterest', config.accountId, result.error || 'Failed to publish to Pinterest');
    }

    return {
        platform: 'pinterest',
        accountId: config.accountId,
        success: true,
        postId: result.pinId,
        postUrl: result.pinUrl,
        publishedAt: new Date(),
    };
}

export const pinterestProvider: PlatformProvider = {
    platform: 'pinterest',
    displayName: 'Pinterest',
    capabilities: {
        carousel: false,
        maxMedia: 1,
        video: true,
        threads: false,
        firstComment: false,
        reels: false,
        stories: false,
        polls: false,
        analytics: true,
        requiresMedia: true,
        maxLength: 500,
    },
    publish,
};
