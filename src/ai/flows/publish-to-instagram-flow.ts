'use server';
/**
 * @fileOverview A flow to publish content to Instagram.
 * Note: Instagram content publishing requires a Business/Creator account linked via Facebook.
 *
 * - publishToInstagram - Creates and publishes a photo post to Instagram.
 * - PublishToInstagramInput - The input type.
 * - PublishToInstagramOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { getInstagramPublishMode } from '@/lib/social/bulk-posts';

const PublishToInstagramInputSchema = z.object({
    caption: z.string().describe('The caption for the post.'),
    mediaUrl: z.string().url().describe('Public URL of the media to post.'),
    mediaUrls: z.array(z.string().url()).optional().describe('Optional ordered list of public media URLs. When more than one is provided a CAROUSEL is created.'),
    mediaType: z.enum(['image', 'video']).default('image').describe('The primary media type being published.'),
    postFormat: z.enum(['standard', 'reel']).default('standard').describe('Whether the post is a standard feed post or a reel.'),
    socialAccountId: z.string().describe('The ID of the connected Instagram account.'),
    firstComment: z.string().optional().describe('Optional first comment posted to the published media after publishing.'),
    collaborators: z.array(z.string()).optional().describe('Optional list of Instagram usernames to tag as collaborators.'),
});
export type PublishToInstagramInput = z.infer<typeof PublishToInstagramInputSchema>;

const PublishToInstagramOutputSchema = z.object({
    postId: z.string().describe('The ID of the created post.'),
});
export type PublishToInstagramOutput = z.infer<typeof PublishToInstagramOutputSchema>;


export async function publishToInstagram(input: PublishToInstagramInput): Promise<PublishToInstagramOutput> {
    return publishToInstagramFlow(input);
}


const publishToInstagramFlow = ai.defineFlow(
    {
        name: 'publishToInstagramFlow',
        inputSchema: PublishToInstagramInputSchema,
        outputSchema: PublishToInstagramOutputSchema,
    },
    async ({ caption, mediaUrl, mediaUrls, mediaType, postFormat, socialAccountId, firstComment, collaborators }) => {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

        if (!accountData) {
            throw new Error('Social account not found. Please reconnect your Instagram account.');
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'instagram') {
            throw new Error('Invalid account. This is not an Instagram account.');
        }

        if (!accessToken) {
            throw new Error('Access token not found. Please reconnect your Instagram account.');
        }

        const igUserId = account.platformAccountId;
        const baseUrl = 'https://graph.facebook.com/v18.0';
        const createMediaUrl = `${baseUrl}/${igUserId}/media`;
        const publishUrl = `${baseUrl}/${igUserId}/media_publish`;

        // Determine whether this is a carousel (more than one media item).
        const carouselItems = (mediaUrls && mediaUrls.length > 1) ? mediaUrls : null;
        const collaboratorsValue = (collaborators && collaborators.length > 0)
            ? JSON.stringify(collaborators)
            : undefined;

        try {
            let containerId: string;

            if (carouselItems) {
                // Step 1a: Create a child container per item (is_carousel_item=true).
                const childIds: string[] = [];
                for (const itemUrl of carouselItems) {
                    const childResponse = await fetch(createMediaUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            image_url: itemUrl,
                            is_carousel_item: 'true',
                            access_token: accessToken,
                        }),
                    });
                    const childData = await childResponse.json();
                    if (!childResponse.ok || childData.error) {
                        console.error('Instagram create carousel item error:', childData);
                        await socialAccountRepository.recordError(socialAccountId, childData.error?.message || 'Unknown error');
                        throw new Error(`Instagram API Error: ${childData.error?.message || 'Failed to create carousel item'}`);
                    }
                    childIds.push(childData.id);
                }

                // Step 1b: Create the parent CAROUSEL container.
                const parentResponse = await fetch(createMediaUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        media_type: 'CAROUSEL',
                        children: childIds.join(','),
                        caption,
                        ...(collaboratorsValue ? { collaborators: collaboratorsValue } : {}),
                        access_token: accessToken,
                    }),
                });
                const parentData = await parentResponse.json();
                if (!parentResponse.ok || parentData.error) {
                    console.error('Instagram create carousel container error:', parentData);
                    await socialAccountRepository.recordError(socialAccountId, parentData.error?.message || 'Unknown error');
                    throw new Error(`Instagram API Error: ${parentData.error?.message || 'Failed to create carousel container'}`);
                }
                containerId = parentData.id;
            } else {
                // Single-media (image / reel) path.
                const publishMode = getInstagramPublishMode({ mediaType, postFormat });
                const createResponse = await fetch(createMediaUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        [publishMode.mediaField]: mediaUrl,
                        [publishMode.captionField]: caption,
                        ...(publishMode.apiMediaType === 'REELS' ? { media_type: publishMode.apiMediaType } : {}),
                        ...(collaboratorsValue ? { collaborators: collaboratorsValue } : {}),
                        access_token: accessToken,
                    }),
                });

                const createData = await createResponse.json();

                if (!createResponse.ok || createData.error) {
                    console.error('Instagram create media error:', createData);
                    await socialAccountRepository.recordError(socialAccountId, createData.error?.message || 'Unknown error');
                    throw new Error(`Instagram API Error: ${createData.error?.message || 'Failed to create media container'}`);
                }

                containerId = createData.id;
            }

            // Step 2: Publish the container
            const publishResponse = await fetch(publishUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    creation_id: containerId,
                    access_token: accessToken,
                }),
            });

            const publishData = await publishResponse.json();

            if (!publishResponse.ok || publishData.error) {
                console.error('Instagram publish error:', publishData);
                await socialAccountRepository.recordError(socialAccountId, publishData.error?.message || 'Unknown error');
                throw new Error(`Instagram API Error: ${publishData.error?.message || 'Failed to publish post'}`);
            }

            const publishedMediaId = publishData.id;

            // Step 3: Optional first comment on the published media. Non-fatal.
            if (firstComment && firstComment.trim().length > 0) {
                try {
                    const commentResponse = await fetch(`${baseUrl}/${publishedMediaId}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            message: firstComment,
                            access_token: accessToken,
                        }),
                    });
                    if (!commentResponse.ok) {
                        const commentErr = await commentResponse.json().catch(() => ({}));
                        console.error('Instagram first-comment failed (non-fatal):', commentErr);
                    }
                } catch (err) {
                    console.error('Instagram first-comment failed (non-fatal):', err);
                }
            }

            await socialAccountRepository.markUsed(socialAccountId);

            return { postId: publishedMediaId };

        } catch (error: unknown) {
            console.error('Failed to publish to Instagram:', error);
            throw new Error(`Could not publish to Instagram: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
);
