/**
 * Reddit provider. Wraps publish-to-reddit-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToReddit } from '@/ai/flows/publish-to-reddit-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;

    if (!config.redditSubreddit || !config.redditTitle) {
        return failResult('reddit', config.accountId, 'Reddit requires subreddit and title');
    }

    const s = (config.settings ?? {}) as Record<string, unknown>;
    const postType = s.postType === 'self' || s.postType === 'link' ? s.postType : undefined;
    const url = typeof s.url === 'string' ? s.url : undefined;

    await publishToReddit({
        title: config.redditTitle,
        text: content,
        subreddit: config.redditSubreddit,
        socialAccountId: config.accountId,
        postType,
        url,
        flairId: typeof s.flairId === 'string' ? s.flairId : undefined,
        flairText: typeof s.flairText === 'string' ? s.flairText : undefined,
        nsfw: typeof s.nsfw === 'boolean' ? s.nsfw : undefined,
        spoiler: typeof s.spoiler === 'boolean' ? s.spoiler : undefined,
    });

    return {
        platform: 'reddit',
        accountId: config.accountId,
        success: true,
        publishedAt: new Date(),
    };
}

export const redditProvider: PlatformProvider = {
    platform: 'reddit',
    displayName: 'Reddit',
    capabilities: {
        carousel: false,
        maxMedia: 1,
        video: true,
        threads: false,
        firstComment: true,
        reels: false,
        stories: false,
        polls: false,
        analytics: false,
        requiresMedia: false,
        maxLength: 40000,
    },
    publish,
};
