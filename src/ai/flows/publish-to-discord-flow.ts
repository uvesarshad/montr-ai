'use server';
/**
 * @fileOverview A flow to publish a message to a Discord channel via a bot.
 *
 * - publishToDiscord - Sends a message to a Discord channel.
 * - PublishToDiscordInput - The input type.
 * - PublishToDiscordOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PublishToDiscordInputSchema = z.object({
    accountId: z.string().describe('The ID of the connected Discord bot account.'),
    content: z.string().describe('The message content.'),
    channelId: z.string().optional().describe('The target Discord channel ID.'),
    mediaUrls: z.array(z.string()).optional().describe('Optional media URLs appended to the message as links.'),
});
export type PublishToDiscordInput = z.infer<typeof PublishToDiscordInputSchema>;

const PublishToDiscordOutputSchema = z.object({
    success: z.boolean(),
    postId: z.string().optional(),
    postUrl: z.string().optional(),
    error: z.string().optional(),
});
export type PublishToDiscordOutput = z.infer<typeof PublishToDiscordOutputSchema>;

export async function publishToDiscord(input: PublishToDiscordInput): Promise<PublishToDiscordOutput> {
    return publishToDiscordFlow(input);
}

const publishToDiscordFlow = ai.defineFlow(
    {
        name: 'publishToDiscordFlow',
        inputSchema: PublishToDiscordInputSchema,
        outputSchema: PublishToDiscordOutputSchema,
    },
    async ({ accountId, content, channelId, mediaUrls }) => {
        try {
            const accountData = await socialAccountRepository.findByIdWithTokens(accountId);
            if (!accountData) {
                return { success: false, error: 'Social account not found. Please reconnect your Discord bot.' };
            }

            const { account, accessToken, botToken } = accountData;
            if (account.platform !== 'discord') {
                return { success: false, error: 'Invalid account. This is not a Discord account.' };
            }

            // Discord connect stores the token in encryptedAccessToken; botToken is a fallback.
            const token = botToken || accessToken;
            if (!token) {
                return { success: false, error: 'Discord token not found. Please reconnect your Discord bot.' };
            }

            const targetChannelId = channelId;
            if (!targetChannelId) {
                return { success: false, error: 'No Discord channel specified.' };
            }

            // Append media URLs as simple links (full attachment upload is out of scope).
            let body = content;
            if (mediaUrls && mediaUrls.length > 0) {
                const links = mediaUrls.filter((u) => !u.startsWith('data:'));
                if (links.length > 0) {
                    body = `${body}\n${links.join('\n')}`.trim();
                }
            }

            const response = await fetch(`https://discord.com/api/v10/channels/${targetChannelId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: body }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const error = data?.message || `Discord API error (${response.status})`;
                await socialAccountRepository.recordError(accountId, error);
                return { success: false, error };
            }

            await socialAccountRepository.markUsed(accountId);

            const messageId: string | undefined = data?.id;
            const guildId = data?.guild_id || account.discordMetadata?.guildId;
            const postUrl = messageId && guildId
                ? `https://discord.com/channels/${guildId}/${targetChannelId}/${messageId}`
                : undefined;

            return { success: true, postId: messageId, postUrl };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error publishing to Discord';
            await socialAccountRepository.recordError(accountId, message).catch(() => {});
            return { success: false, error: message };
        }
    }
);
