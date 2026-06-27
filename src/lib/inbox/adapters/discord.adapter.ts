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
 * Discord Channel Adapter
 * Uses Discord Bot API
 */
export class DiscordAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'discord';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.config.guildName || channel.name;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation, content, mediaUrl, mediaType: _mediaType } = params;

        try {
            const botToken = channel.config.botToken;
            const channelId = conversation.metadata?.channelId;

            if (!botToken || !channelId) {
                throw new Error('Missing required Discord configuration');
            }

            const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

            const messagePayload: Record<string, unknown> = {
                content,
            };

            // Handle media attachments
            if (mediaUrl) {
                messagePayload.embeds = [
                    {
                        image: {
                            url: mediaUrl,
                        },
                    },
                ];
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bot ${botToken}`,
                },
                body: JSON.stringify(messagePayload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to send Discord message');
            }

            return {
                externalMessageId: data.id,
                status: 'sent',
            };
        } catch (error: unknown) {
            return {
                externalMessageId: '',
                status: 'failed',
                error: error instanceof Error ? error.message : 'Failed to send Discord message',
            };
        }
    }

    async receiveMessage(params: ReceiveMessageParams): Promise<ReceiveMessageResult> {
        const { channel: _channel, payload } = params;

        // Parse Discord webhook/gateway payload
        const author = payload.author as Record<string, unknown> | undefined;

        if (!payload || (author && author.bot)) {
            throw new Error('Invalid Discord message or bot message');
        }

        const userId = String(author?.id || '');
        const username = String(author?.username || '');
        const channelId = String(payload.channel_id || '');
        const content = String(payload.content || '');

        // Handle attachments
        let mediaUrl: string | undefined;
        let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
        let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';

        const attachments = payload.attachments as Array<Record<string, unknown>> | undefined;
        if (attachments && attachments.length > 0) {
            const attachment = attachments[0];
            mediaUrl = attachment.url as string | undefined;
            const contentType = String(attachment.content_type || '');

            if (contentType.startsWith('image/')) {
                messageType = 'image';
                mediaType = 'image';
            } else if (contentType.startsWith('video/')) {
                messageType = 'video';
                mediaType = 'video';
            } else {
                messageType = 'document';
                mediaType = 'document';
            }
        }

        const externalId = this.createExternalId('discord', `${channelId}-${userId}`);

        return {
            message: {
                direction: 'inbound',
                messageType,
                content,
                mediaUrl,
                mediaType,
                externalMessageId: String(payload.id || ''),
                status: 'sent',
                metadata: {
                    channelId,
                    messageId: payload.id as string | undefined,
                    timestamp: payload.timestamp as string | undefined,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    channelId,
                    channelName: payload.channel_name as string | undefined,
                    userId,
                    username,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const { botToken } = channel.config;

            if (!botToken) {
                return {
                    isValid: false,
                    error: 'Missing bot token',
                };
            }

            // Test API call - get bot user info
            const url = 'https://discord.com/api/v10/users/@me';
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bot ${botToken}`,
                },
            });

            if (!response.ok) {
                const data = await response.json();
                return {
                    isValid: false,
                    error: data.message || 'Invalid bot token',
                };
            }

            const data = await response.json();

            return {
                isValid: true,
                details: {
                    botUsername: data.username,
                    botId: data.id,
                },
            };
        } catch (error: unknown) {
            return {
                isValid: false,
                error: error instanceof Error ? error.message : 'Validation failed',
            };
        }
    }
}
