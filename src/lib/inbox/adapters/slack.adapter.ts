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
 * Slack Channel Adapter
 * Uses Slack Web API and Events API
 */
export class SlackAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'slack';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.config.teamName || channel.name;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation, content, mediaUrl, mediaType: _mediaType } = params;

        try {
            const botToken = channel.config.botToken;
            const channelId = conversation.metadata?.channelId;
            const threadTs = conversation.metadata?.threadTs;

            if (!botToken || !channelId) {
                throw new Error('Missing required Slack configuration');
            }

            const url = 'https://slack.com/api/chat.postMessage';

            const messagePayload: Record<string, unknown> = {
                channel: channelId,
                text: content,
            };

            // Support threading
            if (threadTs) {
                messagePayload.thread_ts = threadTs;
            }

            // Handle media attachments
            if (mediaUrl) {
                messagePayload.attachments = [
                    {
                        image_url: mediaUrl,
                        fallback: content,
                    },
                ];
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${botToken}`,
                },
                body: JSON.stringify(messagePayload),
            });

            const data = await response.json();

            if (!data.ok) {
                throw new Error(data.error || 'Failed to send Slack message');
            }

            return {
                externalMessageId: data.ts,
                status: 'sent',
            };
        } catch (error: unknown) {
            return {
                externalMessageId: '',
                status: 'failed',
                error: error instanceof Error ? error.message : 'Failed to send message',
            };
        }
    }

    async receiveMessage(params: ReceiveMessageParams): Promise<ReceiveMessageResult> {
        const { channel: _channel, payload } = params;

        // Parse Slack Events API payload
        const event = payload.event as Record<string, unknown> | undefined;

        if (!event || event.bot_id) {
            throw new Error('Invalid Slack event or bot message');
        }

        const userId = String(event.user || '');
        const channelId = String(event.channel || '');
        const content = String(event.text || '');
        const threadTs = String(event.thread_ts || event.ts || '');

        // Handle file attachments
        let mediaUrl: string | undefined;
        let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
        let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';

        const files = event.files as Array<Record<string, unknown>> | undefined;
        if (files && files.length > 0) {
            const file = files[0];
            mediaUrl = file.url_private as string | undefined;
            const mimetype = String(file.mimetype || '');

            if (mimetype.startsWith('image/')) {
                messageType = 'image';
                mediaType = 'image';
            } else if (mimetype.startsWith('video/')) {
                messageType = 'video';
                mediaType = 'video';
            } else {
                messageType = 'document';
                mediaType = 'document';
            }
        }

        const externalId = this.createExternalId('slack', `${channelId}-${userId}`);

        return {
            message: {
                direction: 'inbound',
                messageType,
                content,
                mediaUrl,
                mediaType,
                externalMessageId: String(event.ts || ''),
                status: 'sent',
                metadata: {
                    channelId,
                    threadTs,
                    timestamp: event.ts,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    channelId,
                    channelName: event.channel_name as string | undefined,
                    userId,
                    threadTs,
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

            // Test API call - auth.test
            const url = 'https://slack.com/api/auth.test';
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${botToken}`,
                },
            });

            const data = await response.json();

            if (!data.ok) {
                return {
                    isValid: false,
                    error: data.error || 'Invalid bot token',
                };
            }

            return {
                isValid: true,
                details: {
                    teamName: data.team,
                    teamId: data.team_id,
                    botUserId: data.user_id,
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
