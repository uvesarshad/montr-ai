/**
 * TikTok provider. Wraps publish-to-tiktok-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToTikTok } from '@/ai/flows/publish-to-tiktok-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';

    if (!mediaUrl) {
        return failResult('tiktok', config.accountId, 'TikTok requires a video');
    }
    if (primaryMediaType !== 'video') {
        return failResult('tiktok', config.accountId, 'TikTok only supports video posts');
    }

    const s = (config.settings ?? {}) as Record<string, unknown>;
    const privacyLevel =
        s.privacyLevel === 'PUBLIC_TO_EVERYONE' ||
        s.privacyLevel === 'MUTUAL_FOLLOW_FRIENDS' ||
        s.privacyLevel === 'SELF_ONLY'
            ? s.privacyLevel
            : undefined;

    const result = await publishToTikTok({
        accountId: config.accountId,
        caption: content,
        videoUrl: mediaUrl,
        privacyLevel,
        disableDuet: typeof s.disableDuet === 'boolean' ? s.disableDuet : undefined,
        disableStitch: typeof s.disableStitch === 'boolean' ? s.disableStitch : undefined,
        disableComment: typeof s.disableComment === 'boolean' ? s.disableComment : undefined,
        brandContentToggle: typeof s.brandContentToggle === 'boolean' ? s.brandContentToggle : undefined,
        brandOrganicToggle: typeof s.brandOrganicToggle === 'boolean' ? s.brandOrganicToggle : undefined,
        isAigc: typeof s.isAigc === 'boolean' ? s.isAigc : undefined,
    });

    if (!result.success) {
        return failResult('tiktok', config.accountId, result.error || 'Failed to publish to TikTok');
    }

    return {
        platform: 'tiktok',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        publishedAt: new Date(),
    };
}

export const tiktokProvider: PlatformProvider = {
    platform: 'tiktok',
    displayName: 'TikTok',
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
        maxLength: 2200,
    },
    publish,
};
