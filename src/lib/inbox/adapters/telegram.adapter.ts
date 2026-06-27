import {
    BaseChannelAdapter,
    SendMessageParams,
    SendMessageResult,
    ReceiveMessageParams,
    ReceiveMessageResult,
    ValidateCredentialsResult,
} from './channel-adapter.interface';
import { IInboxChannel } from '@/lib/db/models/inbox-channel.model';

/**
 * Telegram Channel Adapter
 * Uses Telegram Bot API (https://core.telegram.org/bots/api)
 * 
 * Setup:
 * 1. Create bot via @BotFather
 * 2. Store bot token in channel config
 * 3. Set webhook: POST https://api.telegram.org/bot{token}/setWebhook?url={webhook_url}
 */
export class TelegramAdapter extends BaseChannelAdapter {
    private getBaseUrl(channel: IInboxChannel): string {
        return `https://api.telegram.org/bot${channel.config.telegramBotToken}`;
    }

    getChannelType(): string {
        return 'telegram';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.config.telegramBotUsername
            ? `@${channel.config.telegramBotUsername}`
            : channel.name;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation, content } = params;

        try {
            const botToken = channel.config.telegramBotToken;
            const chatId = conversation.metadata?.chatId || conversation.externalId?.split(':')[1];

            if (!botToken || !chatId) {
                throw new Error('Missing Telegram bot token or chat ID');
            }

            const baseUrl = this.getBaseUrl(channel);

            // Handle media messages
            if (params.mediaUrl && params.mediaType) {
                const mediaEndpoints: Record<string, string> = {
                    image: 'sendPhoto',
                    video: 'sendVideo',
                    audio: 'sendAudio',
                    document: 'sendDocument',
                };

                const endpoint = mediaEndpoints[params.mediaType] || 'sendDocument';
                const mediaField = params.mediaType === 'image' ? 'photo' : params.mediaType;

                const response = await fetch(`${baseUrl}/${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        [mediaField]: params.mediaUrl,
                        caption: content || undefined,
                    }),
                });

                const data = await response.json();
                if (!data.ok) throw new Error(data.description || 'Failed to send media');

                return {
                    externalMessageId: String(data.result.message_id),
                    status: 'sent',
                };
            }

            // Text message
            const response = await fetch(`${baseUrl}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: content,
                    parse_mode: 'HTML',
                }),
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.description || 'Failed to send message');

            return {
                externalMessageId: String(data.result.message_id),
                status: 'sent',
            };
        } catch (error) {
            return {
                externalMessageId: '',
                status: 'failed',
                error: (error as Error).message,
            };
        }
    }

    async receiveMessage(params: ReceiveMessageParams): Promise<ReceiveMessageResult> {
        const { payload } = params;

        // Telegram webhook sends an Update object
        const message = (payload.message || payload.edited_message) as Record<string, unknown> | undefined;

        if (!message) {
            throw new Error('Invalid Telegram webhook payload — no message found');
        }

        const chat = message.chat as Record<string, unknown> | undefined;
        const from = message.from as Record<string, unknown> | undefined;
        const chatId = String(chat?.id || '');
        const senderName = [from?.first_name, from?.last_name]
            .filter(Boolean)
            .join(' ') || String(from?.username || chatId);

        let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
        let content = '';
        let mediaUrl: string | undefined;
        let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
        let fileName: string | undefined;

        if (message.text) {
            content = String(message.text);
        } else if (message.photo) {
            messageType = 'image';
            mediaType = 'image';
            // Use the highest resolution photo (last in array)
            const photos = message.photo as Array<Record<string, unknown>>;
            mediaUrl = String(photos[photos.length - 1].file_id || '');
            content = String(message.caption || '');
        } else if (message.video) {
            messageType = 'video';
            mediaType = 'video';
            mediaUrl = String((message.video as Record<string, unknown>).file_id || '');
            content = String(message.caption || '');
        } else if (message.voice || message.audio) {
            messageType = 'audio';
            mediaType = 'audio';
            const audioMsg = (message.voice || message.audio) as Record<string, unknown>;
            mediaUrl = String(audioMsg.file_id || '');
        } else if (message.document) {
            messageType = 'document';
            mediaType = 'document';
            const doc = message.document as Record<string, unknown>;
            mediaUrl = String(doc.file_id || '');
            fileName = doc.file_name as string | undefined;
            content = String(message.caption || '');
        }

        const externalId = this.createExternalId('telegram', chatId);

        return {
            message: {
                direction: 'inbound',
                messageType,
                content,
                mediaUrl,
                mediaType,
                fileName,
                externalMessageId: String(message.message_id || ''),
                status: 'sent',
                metadata: {
                    chatType: chat?.type,
                    fromUsername: from?.username,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    chatId,
                    senderName,
                    username: from?.username as string | undefined,
                    chatType: chat?.type as string | undefined,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const botToken = channel.config.telegramBotToken;
            if (!botToken) {
                return { isValid: false, error: 'Missing Telegram bot token' };
            }

            const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
            const data = await response.json();

            if (!data.ok) {
                return { isValid: false, error: data.description || 'Invalid bot token' };
            }

            return {
                isValid: true,
                details: {
                    botId: data.result.id,
                    botName: data.result.first_name,
                    botUsername: data.result.username,
                },
            };
        } catch (error) {
            return { isValid: false, error: (error as Error).message };
        }
    }
}
