/**
 * Facebook provider. Wraps publish-to-facebook-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToFacebook } from '@/ai/flows/publish-to-facebook-flow';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';

    // Only public http(s) URLs are usable by the Graph API (file_url / url).
    const httpMedia = ctx.mediaUrls.filter((u) => /^https?:\/\//i.test(u));
    const mediaUrl = httpMedia.length > 0 ? httpMedia[0] : undefined;
    const mediaUrls = httpMedia.length > 0 ? httpMedia : undefined;

    const result = await publishToFacebook({
        text: content,
        socialAccountId: config.accountId,
        mediaUrl,
        mediaUrls,
        mediaType: primaryMediaType,
        firstComment: config.firstComment || undefined,
    });

    return {
        platform: 'facebook',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const facebookProvider: PlatformProvider = {
    platform: 'facebook',
    displayName: 'Facebook',
    capabilities: {
        carousel: true,
        maxMedia: 10,
        video: true,
        threads: false,
        firstComment: true,
        reels: true,
        stories: true,
        polls: false,
        analytics: true,
        requiresMedia: false,
        maxLength: 63206,
    },
    publish,
};
