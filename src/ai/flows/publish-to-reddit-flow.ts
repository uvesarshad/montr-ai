'use server';
/**
 * @fileOverview A flow to publish a post to Reddit.
 *
 * - publishToReddit - Posts content to a subreddit.
 * - PublishToRedditInput - The input type.
 * - PublishToRedditOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PublishToRedditInputSchema = z.object({
    title: z.string().describe('The post title (required for Reddit).'),
    text: z.string().optional().describe('The post body text (for self posts).'),
    subreddit: z.string().describe('The subreddit name (without r/ prefix).'),
    socialAccountId: z.string().describe('The ID of the connected Reddit account.'),
    url: z.string().url().optional().describe('URL for link posts.'),
    /** Explicit post type. Defaults to "link" when a url is present, else "self". */
    postType: z.enum(['self', 'link']).optional().describe('Whether to submit a self (text) or link post.'),
    /** Flair template id to apply to the post. */
    flairId: z.string().optional().describe('The subreddit flair template id.'),
    /** Flair text (for editable flairs). */
    flairText: z.string().optional().describe('The flair text for editable flairs.'),
    /** Mark the post as NSFW (over 18). */
    nsfw: z.boolean().optional().describe('Mark the post as NSFW.'),
    /** Mark the post as a spoiler. */
    spoiler: z.boolean().optional().describe('Mark the post as a spoiler.'),
});
export type PublishToRedditInput = z.infer<typeof PublishToRedditInputSchema>;

const PublishToRedditOutputSchema = z.object({
    postId: z.string().describe('The ID of the created post.'),
    postUrl: z.string().url().describe('The URL of the created post.'),
});
export type PublishToRedditOutput = z.infer<typeof PublishToRedditOutputSchema>;


export async function publishToReddit(input: PublishToRedditInput): Promise<PublishToRedditOutput> {
    return publishToRedditFlow(input);
}


const publishToRedditFlow = ai.defineFlow(
    {
        name: 'publishToRedditFlow',
        inputSchema: PublishToRedditInputSchema,
        outputSchema: PublishToRedditOutputSchema,
    },
    async ({ title, text, subreddit, socialAccountId, url, postType, flairId, flairText, nsfw, spoiler }) => {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

        if (!accountData) {
            throw new Error('Social account not found. Please reconnect your Reddit account.');
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'reddit') {
            throw new Error('Invalid account. This is not a Reddit account.');
        }

        if (!accessToken) {
            throw new Error('Access token not found. Please reconnect your Reddit account.');
        }

        const endpointURL = 'https://oauth.reddit.com/api/submit';

        // Resolve the post kind: explicit postType wins, else infer from url presence.
        const kind = postType || (url ? 'link' : 'self');

        // Build form data
        const formData = new URLSearchParams({
            api_type: 'json',
            sr: subreddit,
            title: title,
            kind,
        });

        if (kind === 'link' && url) {
            formData.set('url', url);
        } else if (text) {
            formData.set('text', text);
        }

        if (flairId) {
            formData.set('flair_id', flairId);
        }
        if (flairText) {
            formData.set('flair_text', flairText);
        }
        if (nsfw) {
            formData.set('nsfw', 'true');
        }
        if (spoiler) {
            formData.set('spoiler', 'true');
        }

        try {
            const response = await fetch(endpointURL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': 'Montr/1.0',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
            });

            const responseData = await response.json();

            if (!response.ok || responseData.json?.errors?.length > 0) {
                console.error('Reddit API Error:', responseData);

                const errorMsg = responseData.json?.errors?.[0]?.[1] || 'Unknown error';
                await socialAccountRepository.recordError(socialAccountId, errorMsg);

                if (response.status === 401) {
                    throw new Error('Reddit access token expired. Please reconnect your Reddit account.');
                }

                throw new Error(`Reddit API Error: ${errorMsg}`);
            }

            const postData = responseData.json?.data;
            const postId = postData?.name || postData?.id;
            const postUrl = postData?.url || `https://reddit.com${postData?.permalink}`;

            await socialAccountRepository.markUsed(socialAccountId);

            return { postId, postUrl };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to publish to Reddit:', error);
            throw new Error(`Could not publish to Reddit: ${message}`);
        }
    }
);
