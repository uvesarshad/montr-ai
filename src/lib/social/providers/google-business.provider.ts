/**
 * Google Business provider. Wraps publish-to-google-business-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToGoogleBusiness } from '@/ai/flows/publish-to-google-business-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';

    const result = await publishToGoogleBusiness({
        accountId: config.accountId,
        content,
        imageUrl: mediaUrl && primaryMediaType === 'image' && /^https:\/\//i.test(mediaUrl) ? mediaUrl : undefined,
    });

    if (!result.success) {
        return failResult('google_business', config.accountId, result.error || 'Failed to publish to Google Business');
    }

    return {
        platform: 'google_business',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const googleBusinessProvider: PlatformProvider = {
    platform: 'google_business',
    displayName: 'Google Business',
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
        requiresMedia: false,
        maxLength: 1500,
    },
    publish,
};
