/**
 * Dev.to provider. Wraps publish-to-devto-flow.
 *
 * Publishes a markdown article. The title is read from config.settings.title,
 * falling back to the first line of the content. Tags come from settings.tags.
 */
import { publishToDevto } from '@/ai/flows/publish-to-devto-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const settings = (config.settings || {}) as Record<string, unknown>;

    // Title: explicit setting, else the first non-empty line of content.
    const settingsTitle = typeof settings.title === 'string' ? settings.title.trim() : '';
    const firstLine = content.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || '';
    const title = settingsTitle || firstLine;
    if (!title) {
        return failResult('devto', config.accountId, 'A title is required to publish a Dev.to article');
    }

    const tags = Array.isArray(settings.tags)
        ? (settings.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : undefined;

    const result = await publishToDevto({
        accountId: config.accountId,
        title,
        content,
        tags,
    });

    if (!result.success) {
        return failResult('devto', config.accountId, result.error || 'Failed to publish to Dev.to');
    }

    return {
        platform: 'devto',
        accountId: config.accountId,
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
    };
}

export const devtoProvider: PlatformProvider = {
    platform: 'devto',
    displayName: 'Dev.to',
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
