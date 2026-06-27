/**
 * Instagram provider. Wraps publish-to-instagram-flow.
 *
 * Capabilities declare the platform's potential (consumed by the composer UI);
 * `publish` is the behavior-preserving extraction of the former worker switch
 * case. Per-platform feature work (threads/carousel/first-comment/settings)
 * lands in this file alongside the flow.
 */
import { publishToInstagram } from '@/ai/flows/publish-to-instagram-flow';
import { failResult } from './types';
import type { PlatformProvider, PublishContext } from './types';
import type { IPublishResult } from '@/lib/db/models/scheduled-post.model';

async function publish(ctx: PublishContext): Promise<IPublishResult> {
    const { content, config } = ctx;
    const mediaUrl = ctx.mediaUrls.length > 0 ? ctx.mediaUrls[0] : undefined;
    const primaryMediaType = ctx.mediaTypes[0] || 'image';
    const postFormat = ctx.postFormat;

    if (!mediaUrl) {
        return failResult('instagram', config.accountId, 'Instagram requires media');
    }

    // >1 media item => carousel (handled inside the flow).
    const carousel = ctx.mediaUrls.length > 1 ? ctx.mediaUrls : undefined;
    const firstComment = config.firstComment ?? config.instagramFirstComment ?? undefined;
    const rawCollaborators = config.settings?.collaborators;
    const collaborators = Array.isArray(rawCollaborators)
        ? rawCollaborators.filter((c): c is string => typeof c === 'string')
        : undefined;

    await publishToInstagram({
        caption: content,
        mediaUrl,
        mediaUrls: carousel,
        mediaType: primaryMediaType,
        postFormat,
        socialAccountId: config.accountId,
        firstComment: firstComment || undefined,
        collaborators,
    });

    return {
        platform: 'instagram',
        accountId: config.accountId,
        success: true,
        publishedAt: new Date(),
    };
}

export const instagramProvider: PlatformProvider = {
    platform: 'instagram',
    displayName: 'Instagram',
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
        requiresMedia: true,
        maxLength: 2200,
    },
    publish,
};
