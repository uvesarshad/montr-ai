/**
 * Telegram provider. Wraps publish-to-telegram-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToTelegram } from '@/ai/flows/publish-to-telegram-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;

    if (!config.telegramChatIds || config.telegramChatIds.length === 0) {
        return failResult('telegram', config.accountId, 'No Telegram channels specified');
    }

    const result = await publishToTelegram({
        text: content,
        chatIds: config.telegramChatIds,
        socialAccountId: config.accountId,
        mediaUrl,
        mediaUrls: ctx.mediaUrls,
        firstComment: config.firstComment || undefined,
    });

    const successCount = result.results.filter(r => r.success).length;
    if (successCount === 0) {
        return failResult('telegram', config.accountId, 'Failed to post to any Telegram channel');
    }

    return {
        platform: 'telegram',
        accountId: config.accountId,
        success: true,
        publishedAt: new Date(),
    };
}

export const telegramProvider: PlatformProvider = {
    platform: 'telegram',
    displayName: 'Telegram',
    capabilities: {
        carousel: true,
        maxMedia: 10,
        video: true,
        threads: false,
        firstComment: true,
        reels: false,
        stories: false,
        polls: true,
        analytics: false,
        requiresMedia: false,
        maxLength: 4096,
    },
    publish,
};
