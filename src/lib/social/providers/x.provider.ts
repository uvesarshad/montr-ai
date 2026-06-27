/**
 * X (Twitter) provider. Wraps publish-to-x-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToX } from '@/ai/flows/publish-to-x-flow';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, mediaUrls, config } = ctx;
    const media = mediaUrls.slice(0, 4);

    // Thread path: publish each non-empty segment chained via replyToTweetId.
    // The first segment carries the media; subsequent segments are text replies.
    if (config.isThread && config.threadParts && config.threadParts.length > 0) {
        const segments = config.threadParts.filter((p) => p && p.trim().length > 0);

        if (segments.length === 0) {
            // No usable thread segments — fall through to single-tweet behavior.
        } else {
            let firstTweetId = '';
            let firstTweetUrl = '';
            let prevTweetId: string | undefined;

            for (let i = 0; i < segments.length; i++) {
                const result = await publishToX({
                    text: segments[i],
                    socialAccountId: config.accountId,
                    mediaUrls: i === 0 ? media : undefined,
                    replyToTweetId: prevTweetId,
                });
                if (i === 0) {
                    firstTweetId = result.tweetId;
                    firstTweetUrl = result.tweetUrl;
                }
                prevTweetId = result.tweetId;
            }

            return {
                platform: 'x',
                accountId: config.accountId,
                success: true,
                postId: firstTweetId,
                postUrl: firstTweetUrl,
                publishedAt: new Date(),
            };
        }
    }

    // Single-tweet path with full media set.
    const result = await publishToX({
        text: content,
        socialAccountId: config.accountId,
        mediaUrls: media,
    });

    // Optional first comment, posted as a reply to the new tweet. Non-fatal.
    if (config.firstComment && config.firstComment.trim().length > 0) {
        try {
            await publishToX({
                text: config.firstComment,
                socialAccountId: config.accountId,
                replyToTweetId: result.tweetId,
            });
        } catch (err) {
            console.error('X first-comment failed (non-fatal):', err);
        }
    }

    return {
        platform: 'x',
        accountId: config.accountId,
        success: true,
        postId: result.tweetId,
        postUrl: result.tweetUrl,
        publishedAt: new Date(),
    };
}

export const xProvider: PlatformProvider = {
    platform: 'x',
    displayName: 'X (Twitter)',
    capabilities: {
        carousel: true,
        maxMedia: 4,
        video: true,
        threads: true,
        firstComment: true,
        reels: false,
        stories: false,
        polls: true,
        analytics: true,
        requiresMedia: false,
        maxLength: 280,
    },
    publish,
};
