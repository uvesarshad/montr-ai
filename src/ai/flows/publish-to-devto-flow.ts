'use server';
/**
 * @fileOverview A flow to publish an article to Dev.to via its Articles API.
 *
 * - publishToDevto - Publishes a markdown article to Dev.to.
 * - PublishToDevtoInput - The input type.
 * - PublishToDevtoOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PublishToDevtoInputSchema = z.object({
    accountId: z.string().describe('The ID of the connected Dev.to account.'),
    title: z.string().describe('The article title.'),
    content: z.string().describe('The article body in markdown.'),
    tags: z.array(z.string()).optional().describe('Optional article tags (max 4 used).'),
});
export type PublishToDevtoInput = z.infer<typeof PublishToDevtoInputSchema>;

const PublishToDevtoOutputSchema = z.object({
    success: z.boolean(),
    postId: z.string().optional(),
    postUrl: z.string().optional(),
    error: z.string().optional(),
});
export type PublishToDevtoOutput = z.infer<typeof PublishToDevtoOutputSchema>;

export async function publishToDevto(input: PublishToDevtoInput): Promise<PublishToDevtoOutput> {
    return publishToDevtoFlow(input);
}

const publishToDevtoFlow = ai.defineFlow(
    {
        name: 'publishToDevtoFlow',
        inputSchema: PublishToDevtoInputSchema,
        outputSchema: PublishToDevtoOutputSchema,
    },
    async ({ accountId, title, content, tags }) => {
        try {
            const accountData = await socialAccountRepository.findByIdWithTokens(accountId);
            if (!accountData) {
                return { success: false, error: 'Social account not found. Please reconnect your Dev.to account.' };
            }

            const { account, accessToken } = accountData;
            if (account.platform !== 'devto') {
                return { success: false, error: 'Invalid account. This is not a Dev.to account.' };
            }

            const apiKey = accessToken;
            if (!apiKey) {
                return { success: false, error: 'Dev.to API key not found. Please reconnect your Dev.to account.' };
            }

            if (!title || !title.trim()) {
                return { success: false, error: 'A title is required to publish a Dev.to article.' };
            }

            // Dev.to tags must be alphanumeric; cap at 4 per their API.
            const cleanTags = (tags || [])
                .map((t) => t.replace(/[^a-z0-9]/gi, '').toLowerCase())
                .filter((t) => t.length > 0)
                .slice(0, 4);

            const response = await fetch('https://dev.to/api/articles', {
                method: 'POST',
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.forem.api-v1+json',
                },
                body: JSON.stringify({
                    article: {
                        title: title.trim(),
                        body_markdown: content,
                        published: true,
                        tags: cleanTags,
                    },
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const error = data?.error || `Dev.to API error (${response.status})`;
                await socialAccountRepository.recordError(accountId, error);
                return { success: false, error };
            }

            await socialAccountRepository.markUsed(accountId);

            const articleId = data?.id !== undefined ? String(data.id) : undefined;
            const postUrl: string | undefined = data?.url;
            return { success: true, postId: articleId, postUrl };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error publishing to Dev.to';
            await socialAccountRepository.recordError(accountId, message).catch(() => {});
            return { success: false, error: message };
        }
    }
);
