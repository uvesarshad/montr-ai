/**
 * LinkedIn provider. Wraps publish-to-linkedin-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToLinkedIn } from '@/ai/flows/publish-to-linkedin-flow';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const primaryMediaType: 'image' | 'video' = ctx.mediaTypes[0] || 'image';

    const result = await publishToLinkedIn({
        text: content,
        socialAccountId: config.accountId,
        mediaUrls: ctx.mediaUrls,
        mediaType: primaryMediaType,
        firstComment: config.firstComment || undefined,
    });

    return {
        platform: 'linkedin',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: `https://www.linkedin.com/feed/update/${result.postId}`,
        publishedAt: new Date(),
    };
}

export const linkedinProvider: PlatformProvider = {
    platform: 'linkedin',
    displayName: 'LinkedIn',
    capabilities: {
        carousel: true,
        maxMedia: 9,
        video: true,
        threads: true,
        firstComment: true,
        reels: false,
        stories: false,
        polls: true,
        analytics: true,
        requiresMedia: false,
        maxLength: 3000,
    },
    publish,
};
