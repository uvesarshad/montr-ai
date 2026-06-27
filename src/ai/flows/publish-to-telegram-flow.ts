'use server';
/**
 * @fileOverview A flow to publish a message to Telegram with media support.
 *
 * - publishToTelegram - Sends a message to a Telegram channel or group.
 * - PublishToTelegramInput - The input type.
 * - PublishToTelegramOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PublishToTelegramInputSchema = z.object({
    text: z.string().describe('The message content.'),
    chatIds: z.array(z.string()).describe('Array of chat IDs (channels/groups) to send to.'),
    socialAccountId: z.string().describe('The ID of the connected Telegram bot account.'),
    mediaUrl: z.string().optional().describe('Optional base64 data URL of media to attach (single-media path).'),
    mediaUrls: z.array(z.string()).optional().describe('Optional full ordered media list; when >1, sent as an album via sendMediaGroup.'),
    firstComment: z.string().optional().describe('Optional follow-up message sent as a reply to the posted message (non-fatal).'),
});
export type PublishToTelegramInput = z.infer<typeof PublishToTelegramInputSchema>;

const PublishToTelegramOutputSchema = z.object({
    results: z.array(z.object({
        chatId: z.string(),
        messageId: z.number().optional(),
        success: z.boolean(),
        error: z.string().optional(),
    })).describe('Results for each chat'),
});
export type PublishToTelegramOutput = z.infer<typeof PublishToTelegramOutputSchema>;


export async function publishToTelegram(input: PublishToTelegramInput): Promise<PublishToTelegramOutput> {
    return publishToTelegramFlow(input);
}


const publishToTelegramFlow = ai.defineFlow(
    {
        name: 'publishToTelegramFlow',
        inputSchema: PublishToTelegramInputSchema,
        outputSchema: PublishToTelegramOutputSchema,
    },
    async ({ text, chatIds, socialAccountId, mediaUrl, mediaUrls, firstComment }) => {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

        if (!accountData) {
            throw new Error('Social account not found. Please reconnect your Telegram bot.');
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'telegram') {
            throw new Error('Invalid account. This is not a Telegram bot.');
        }

        const botToken = accessToken;
        if (!botToken) {
            throw new Error('Bot token not found. Please reconnect your Telegram bot.');
        }

        // Resolve the ordered media list: prefer mediaUrls, fall back to single mediaUrl.
        const allMedia = (mediaUrls && mediaUrls.length > 0)
            ? mediaUrls
            : (mediaUrl ? [mediaUrl] : []);

        const results: { chatId: string; messageId?: number; success: boolean; error?: string }[] = [];

        // Send to each chat
        for (const chatId of chatIds) {
            try {
                let responseData;

                if (allMedia.length > 1) {
                    // Album (up to 10 media) via sendMediaGroup
                    responseData = await sendMediaGroupMessage(botToken, chatId, text, allMedia.slice(0, 10));
                } else if (allMedia.length === 1) {
                    // Single media
                    responseData = await sendMediaMessage(botToken, chatId, text, allMedia[0]);
                } else {
                    // Send text only
                    responseData = await sendTextMessage(botToken, chatId, text);
                }

                if (!responseData.ok) {
                    results.push({
                        chatId,
                        success: false,
                        error: responseData.description || 'Unknown error',
                    });
                } else {
                    // sendMediaGroup returns an array of messages; others return a single message.
                    const resultPayload = responseData.result;
                    const messageId = Array.isArray(resultPayload)
                        ? resultPayload[0]?.message_id
                        : resultPayload.message_id;
                    results.push({
                        chatId,
                        messageId,
                        success: true,
                    });

                    // First comment: reply to the posted message (non-fatal).
                    if (firstComment && firstComment.trim() && messageId !== undefined) {
                        try {
                            await sendTextMessage(botToken, chatId, firstComment, messageId);
                        } catch (err) {
                            console.error('[Telegram] first-comment reply failed (non-fatal):', err);
                        }
                    }
                }
            } catch (error: unknown) {
                results.push({
                    chatId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        // Mark account as used if at least one succeeded
        const anySuccess = results.some(r => r.success);
        if (anySuccess) {
            await socialAccountRepository.markUsed(socialAccountId);
        } else {
            await socialAccountRepository.recordError(
                socialAccountId,
                results[0]?.error || 'All posts failed'
            );
        }

        return { results };
    }
);

/**
 * Send a text-only message
 */
async function sendTextMessage(botToken: string, chatId: string, text: string, replyToMessageId?: number) {
    const body: Record<string, unknown> = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
    };
    if (replyToMessageId !== undefined) {
        body.reply_to_message_id = replyToMessageId;
    }
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return await response.json();
}

/**
 * Send an album (2–10 media items) via sendMediaGroup. The caption is applied
 * to the first media item only (Telegram shows it as the album caption).
 */
async function sendMediaGroupMessage(botToken: string, chatId: string, caption: string, mediaUrls: string[]) {
    const formData = new FormData();
    formData.append('chat_id', chatId);

    const mediaPayload: Array<Record<string, unknown>> = [];

    for (let i = 0; i < mediaUrls.length; i++) {
        const { buffer, mimeType } = await getMediaBuffer(mediaUrls[i]);

        const isVideo = mimeType.startsWith('video/');
        const type = isVideo ? 'video' : 'photo';
        const extension = isVideo
            ? (mimeType.split('/')[1] || 'mp4')
            : (mimeType.split('/')[1] || 'jpg');
        const attachName = `media${i}`;

        const entry: Record<string, unknown> = {
            type,
            media: `attach://${attachName}`,
        };
        // Caption + parse_mode only on the first item.
        if (i === 0) {
            entry.caption = caption;
            entry.parse_mode = 'HTML';
        }
        mediaPayload.push(entry);

        const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
        formData.append(attachName, blob, `${attachName}.${extension}`);
    }

    formData.append('media', JSON.stringify(mediaPayload));

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
        method: 'POST',
        body: formData,
    });

    return await response.json();
}

/**
 * Send a message with media (photo or video)
 */
async function sendMediaMessage(botToken: string, chatId: string, caption: string, mediaUrl: string) {
    const { buffer, mimeType } = await getMediaBuffer(mediaUrl);

    // Determine file extension and method
    let method: string;
    let fileField: string;
    let extension: string;

    if (mimeType.startsWith('video/')) {
        method = 'sendVideo';
        fileField = 'video';
        extension = mimeType.split('/')[1] || 'mp4';
    } else if (mimeType.startsWith('image/gif')) {
        method = 'sendAnimation';
        fileField = 'animation';
        extension = 'gif';
    } else {
        method = 'sendPhoto';
        fileField = 'photo';
        extension = mimeType.split('/')[1] || 'jpg';
    }

    // Create form data for file upload
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');

    // Create a Blob from the buffer
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append(fileField, blob, `media.${extension}`);

    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: 'POST',
        body: formData,
    });

    return await response.json();
}

async function getMediaBuffer(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const matches = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
        return {
            mimeType: matches[1],
            buffer: Buffer.from(matches[2], 'base64'),
        };
    }

    const response = await fetch(mediaUrl);
    if (!response.ok) {
        throw new Error('Failed to download media from URL');
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: response.headers.get('content-type') || 'image/jpeg',
    };
}
