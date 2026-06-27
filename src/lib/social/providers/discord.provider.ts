/**
 * Discord provider. Wraps publish-to-discord-flow.
 *
 * Posts a message to a Discord channel via the bot. channelId + firstComment
 * are read from the per-post config.settings blob.
 */
import { publishToDiscord } from '@/ai/flows/publish-to-discord-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, mediaUrls, config } = ctx;
    const settings = (config.settings || {}) as Record<string, unknown>;

    const channelId = typeof settings.channelId === 'string' ? settings.channelId : undefined;
    if (!channelId) {
        return failResult('discord', config.accountId, 'No Discord channel specified');
    }

    const result = await publishToDiscord({
        accountId: config.accountId,
        content,
        channelId,
        mediaUrls,
    });

    if (!result.success) {
        return failResult('discord', config.accountId, result.error || 'Failed to post to Discord');
    }

    // Optional first comment, posted as a follow-up message. Non-fatal.
    const firstComment = config.firstComment
        || (typeof settings.firstComment === 'string' ? settings.firstComment : undefined);
    if (firstComment && firstComment.trim().length > 0) {
        try {
            await publishToDiscord({ accountId: config.accountId, content: firstComment, channelId });
        } catch (err) {
            console.error('Discord first-comment failed (non-fatal):', err);
        }
    }

    return {
        platform: 'discord',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const discordProvider: PlatformProvider = {
    platform: 'discord',
    displayName: 'Discord',
    capabilities: {
        carousel: true,
        maxMedia: 10,
        video: false,
        threads: false,
        firstComment: true,
        reels: false,
        stories: false,
        polls: false,
        analytics: false,
        requiresMedia: false,
        maxLength: 2000,
    },
    publish,
};
