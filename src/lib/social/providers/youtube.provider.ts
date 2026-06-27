/**
 * YouTube provider. Wraps publish-to-youtube-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToYouTube } from '@/ai/flows/publish-to-youtube-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';

    if (!mediaUrl) {
        return failResult('youtube', config.accountId, 'YouTube requires a video');
    }
    if (primaryMediaType !== 'video') {
        return failResult('youtube', config.accountId, 'YouTube only supports video posts');
    }

    const s = (config.settings ?? {}) as Record<string, unknown>;
    const privacyStatus =
        s.privacyStatus === 'public' || s.privacyStatus === 'private' || s.privacyStatus === 'unlisted'
            ? s.privacyStatus
            : undefined;
    const tags = Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === 'string') : undefined;

    const result = await publishToYouTube({
        accountId: config.accountId,
        content,
        videoUrl: mediaUrl,
        title: typeof s.title === 'string' ? s.title : undefined,
        privacyStatus,
        madeForKids: typeof s.madeForKids === 'boolean' ? s.madeForKids : undefined,
        tags,
        notifySubscribers: typeof s.notifySubscribers === 'boolean' ? s.notifySubscribers : undefined,
    });

    if (!result.success) {
        return failResult('youtube', config.accountId, result.error || 'Failed to publish to YouTube');
    }

    return {
        platform: 'youtube',
        accountId: config.accountId,
        success: true,
        postId: result.videoId,
        postUrl: result.videoUrl,
        publishedAt: new Date(),
    };
}

export const youtubeProvider: PlatformProvider = {
    platform: 'youtube',
    displayName: 'YouTube',
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
        maxLength: 5000,
    },
    publish,
};
