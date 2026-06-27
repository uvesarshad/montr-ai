/**
 * Slack provider. Wraps publish-to-slack-flow.
 *
 * Posts a message to a Slack channel via chat.postMessage. channelId +
 * firstComment are read from the per-post config.settings blob.
 */
import { publishToSlack } from '@/ai/flows/publish-to-slack-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const settings = (config.settings || {}) as Record<string, unknown>;

    const channelId = typeof settings.channelId === 'string' ? settings.channelId : undefined;
    if (!channelId) {
        return failResult('slack', config.accountId, 'No Slack channel specified');
    }

    const result = await publishToSlack({
        accountId: config.accountId,
        content,
        channelId,
    });

    if (!result.success) {
        return failResult('slack', config.accountId, result.error || 'Failed to post to Slack');
    }

    // Optional first comment, posted as a follow-up message. Non-fatal.
    const firstComment = config.firstComment
        || (typeof settings.firstComment === 'string' ? settings.firstComment : undefined);
    if (firstComment && firstComment.trim().length > 0) {
        try {
            await publishToSlack({ accountId: config.accountId, content: firstComment, channelId });
        } catch (err) {
            console.error('Slack first-comment failed (non-fatal):', err);
        }
    }

    return {
        platform: 'slack',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const slackProvider: PlatformProvider = {
    platform: 'slack',
    displayName: 'Slack',
    capabilities: {
        carousel: false,
        maxMedia: 1,
        video: false,
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
