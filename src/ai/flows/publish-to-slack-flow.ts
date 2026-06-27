'use server';
/**
 * @fileOverview A flow to publish a message to a Slack channel via chat.postMessage.
 *
 * - publishToSlack - Sends a message to a Slack channel.
 * - PublishToSlackInput - The input type.
 * - PublishToSlackOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PublishToSlackInputSchema = z.object({
    accountId: z.string().describe('The ID of the connected Slack account.'),
    content: z.string().describe('The message text.'),
    channelId: z.string().optional().describe('The target Slack channel ID.'),
});
export type PublishToSlackInput = z.infer<typeof PublishToSlackInputSchema>;

const PublishToSlackOutputSchema = z.object({
    success: z.boolean(),
    postId: z.string().optional(),
    postUrl: z.string().optional(),
    error: z.string().optional(),
});
export type PublishToSlackOutput = z.infer<typeof PublishToSlackOutputSchema>;

export async function publishToSlack(input: PublishToSlackInput): Promise<PublishToSlackOutput> {
    return publishToSlackFlow(input);
}

const publishToSlackFlow = ai.defineFlow(
    {
        name: 'publishToSlackFlow',
        inputSchema: PublishToSlackInputSchema,
        outputSchema: PublishToSlackOutputSchema,
    },
    async ({ accountId, content, channelId }) => {
        try {
            const accountData = await socialAccountRepository.findByIdWithTokens(accountId);
            if (!accountData) {
                return { success: false, error: 'Social account not found. Please reconnect your Slack account.' };
            }

            const { account, accessToken, botToken } = accountData;
            if (account.platform !== 'slack') {
                return { success: false, error: 'Invalid account. This is not a Slack account.' };
            }

            const token = botToken || accessToken;
            if (!token) {
                return { success: false, error: 'Slack token not found. Please reconnect your Slack account.' };
            }

            if (!channelId) {
                return { success: false, error: 'No Slack channel specified.' };
            }

            const response = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({ channel: channelId, text: content }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data?.ok) {
                const error = data?.error || `Slack API error (${response.status})`;
                await socialAccountRepository.recordError(accountId, error);
                return { success: false, error };
            }

            await socialAccountRepository.markUsed(accountId);

            const messageTs: string | undefined = data?.ts;
            return { success: true, postId: messageTs };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error publishing to Slack';
            await socialAccountRepository.recordError(accountId, message).catch(() => {});
            return { success: false, error: message };
        }
    }
);
