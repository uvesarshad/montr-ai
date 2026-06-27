'use server';
/**
 * @fileOverview A flow to publish a post to Facebook Page.
 *
 * - publishToFacebook - Posts content to a Facebook Page.
 * - PublishToFacebookInput - The input type.
 * - PublishToFacebookOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PublishToFacebookInputSchema = z.object({
    text: z.string().describe('The post content.'),
    socialAccountId: z.string().describe('The ID of the connected Facebook Page account.'),
    link: z.string().url().optional().describe('Optional link to include in the post.'),
    mediaUrl: z.string().url().optional().describe('Optional public image URL to include in the post.'),
    mediaUrls: z.array(z.string().url()).optional().describe('Optional ordered list of public media URLs. More than one image creates a multi-photo post.'),
    mediaType: z.enum(['image', 'video']).optional().describe('The primary media type. "video" uploads the media as a Page video.'),
    firstComment: z.string().optional().describe('Optional first comment posted to the new post after publishing.'),
});
export type PublishToFacebookInput = z.infer<typeof PublishToFacebookInputSchema>;

const PublishToFacebookOutputSchema = z.object({
    postId: z.string().describe('The ID of the created post.'),
    postUrl: z.string().optional().describe('The URL of the created post.'),
});
export type PublishToFacebookOutput = z.infer<typeof PublishToFacebookOutputSchema>;


export async function publishToFacebook(input: PublishToFacebookInput): Promise<PublishToFacebookOutput> {
    return publishToFacebookFlow(input);
}


const publishToFacebookFlow = ai.defineFlow(
    {
        name: 'publishToFacebookFlow',
        inputSchema: PublishToFacebookInputSchema,
        outputSchema: PublishToFacebookOutputSchema,
    },
    async ({ text, socialAccountId, link, mediaUrl, mediaUrls, mediaType, firstComment }) => {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

        if (!accountData) {
            throw new Error('Social account not found. Please reconnect your Facebook Page.');
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'facebook') {
            throw new Error('Invalid account. This is not a Facebook account.');
        }

        if (!accessToken) {
            throw new Error('Access token not found. Please reconnect your Facebook Page.');
        }

        const pageId = account.platformAccountId;
        const baseUrl = 'https://graph.facebook.com/v18.0';

        // Normalize the media list: prefer the ordered mediaUrls array, fall back
        // to the single legacy mediaUrl.
        const media = (mediaUrls && mediaUrls.length > 0)
            ? mediaUrls
            : (mediaUrl ? [mediaUrl] : []);
        const primaryMedia = media[0];

        // Helper to surface a Facebook Graph error consistently.
        const handleError = async (response: Response, responseData: { error?: { message?: string; code?: number } }) => {
            console.error('Facebook API Error:', responseData);
            await socialAccountRepository.recordError(
                socialAccountId,
                responseData.error?.message || 'Unknown error'
            );
            if (response.status === 401 || responseData.error?.code === 190) {
                throw new Error('Facebook access token expired. Please reconnect your Facebook Page.');
            }
            throw new Error(`Facebook API Error: ${responseData.error?.message || 'Unknown error'}`);
        };

        try {
            let postId: string;

            if (mediaType === 'video' && primaryMedia) {
                // Video upload via /{page-id}/videos with file_url + description.
                const videoBody: Record<string, string> = {
                    file_url: primaryMedia,
                    access_token: accessToken,
                };
                if (text) videoBody.description = text;

                const response = await fetch(`${baseUrl}/${pageId}/videos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(videoBody),
                });
                const responseData = await response.json();
                if (!response.ok || responseData.error) {
                    await handleError(response, responseData);
                }
                // Video responses return an `id` (video id) and sometimes post_id.
                postId = responseData.post_id || responseData.id;
            } else if (media.length > 1) {
                // Multi-photo post: upload each photo unpublished, then attach to a feed post.
                const attachedMedia: { media_fbid: string }[] = [];
                for (const photoUrl of media) {
                    const photoResponse = await fetch(`${baseUrl}/${pageId}/photos`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            url: photoUrl,
                            published: 'false',
                            access_token: accessToken,
                        }),
                    });
                    const photoData = await photoResponse.json();
                    if (!photoResponse.ok || photoData.error) {
                        await handleError(photoResponse, photoData);
                    }
                    attachedMedia.push({ media_fbid: photoData.id });
                }

                const feedBody: Record<string, string> = { access_token: accessToken };
                if (text) feedBody.message = text;
                attachedMedia.forEach((m, i) => {
                    feedBody[`attached_media[${i}]`] = JSON.stringify(m);
                });

                const response = await fetch(`${baseUrl}/${pageId}/feed`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(feedBody),
                });
                const responseData = await response.json();
                if (!response.ok || responseData.error) {
                    await handleError(response, responseData);
                }
                postId = responseData.id;
            } else {
                // Single image or text-only post (original behavior).
                const endpointURL = primaryMedia
                    ? `${baseUrl}/${pageId}/photos`
                    : `${baseUrl}/${pageId}/feed`;

                const body: Record<string, string> = { access_token: accessToken };
                if (text) body.message = text;
                if (link) body.link = link;
                if (primaryMedia) body.url = primaryMedia;

                const response = await fetch(endpointURL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(body),
                });
                const responseData = await response.json();
                if (!response.ok || responseData.error) {
                    await handleError(response, responseData);
                }
                // /photos returns `post_id` (the feed post) plus the photo `id`.
                postId = responseData.post_id || responseData.id;
            }

            // Optional first comment on the new post. Non-fatal.
            if (firstComment && firstComment.trim().length > 0) {
                try {
                    const commentResponse = await fetch(`${baseUrl}/${postId}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            message: firstComment,
                            access_token: accessToken,
                        }),
                    });
                    if (!commentResponse.ok) {
                        const commentErr = await commentResponse.json().catch(() => ({}));
                        console.error('Facebook first-comment failed (non-fatal):', commentErr);
                    }
                } catch (err) {
                    console.error('Facebook first-comment failed (non-fatal):', err);
                }
            }

            await socialAccountRepository.markUsed(socialAccountId);

            return { postId, postUrl: `https://www.facebook.com/${postId}` };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to publish to Facebook:', error);
            throw new Error(`Could not publish to Facebook: ${message}`);
        }
    }
);
