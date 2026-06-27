/**
 * WordPress provider. Wraps publish-to-wordpress-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToWordPress } from '@/ai/flows/publish-to-wordpress-flow';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;

    const title = content.split('\n')[0].slice(0, 200) || 'Untitled post';
    const result = await publishToWordPress({
        title,
        content,
        status: 'publish',
    });

    return {
        platform: 'wordpress',
        accountId: config.accountId,
        success: true,
        postId: result.postId.toString(),
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const wordpressProvider: PlatformProvider = {
    platform: 'wordpress',
    displayName: 'WordPress',
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
        maxLength: 100000,
    },
    publish,
};
