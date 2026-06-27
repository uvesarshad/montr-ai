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
 * Facebook Messenger Channel Adapter
 * Uses Meta Graph API (Messenger Platform)
 */
export class FacebookAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'facebook';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.config.pageId || channel.name;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation, content, mediaUrl, mediaType } = params;

        try {
            const pageId = channel.config.pageId;
            const accessToken = channel.config.pageAccessToken;
            const recipientId = conversation.metadata?.senderId;

            if (!pageId || !accessToken || !recipientId) {
                throw new Error('Missing required Facebook configuration');
            }

            const url = `https://graph.facebook.com/v18.0/${pageId}/messages`;

            const messagePayload: Record<string, unknown> = {
                recipient: { id: recipientId },
                messaging_type: 'RESPONSE',
            };

            // Handle media messages
            if (mediaUrl && mediaType) {
                messagePayload.message = {
                    attachment: {
                        type: mediaType,
                        payload: {
                            url: mediaUrl,
                            is_reusable: true,
                        },
                    },
                };
            } else {
                // Text message
                messagePayload.message = {
                    text: content,
                };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...messagePayload,
                    access_token: accessToken,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to send Facebook message');
            }

            return {
                externalMessageId: data.message_id,
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

        // Parse Meta webhook payload
        const entries = payload.entry as Array<Record<string, unknown>> | undefined;
        const entry = entries?.[0];
        const messagingList = entry?.messaging as Array<Record<string, unknown>> | undefined;
        const messaging = messagingList?.[0];

        if (!messaging) {
            throw new Error('Invalid Facebook webhook payload');
        }

        const sender = messaging.sender as Record<string, unknown>;
        const senderId = String(sender.id || '');
        const message = messaging.message as Record<string, unknown> | undefined;

        // Skip echo messages
        if (message?.is_echo) {
            throw new Error('Echo message, skipping');
        }

        let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
        let content = '';
        let mediaUrl: string | undefined;
        let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;

        if (message?.text) {
            content = String(message.text);
        } else if (message?.attachments) {
            const attachments = message.attachments as Array<Record<string, unknown>>;
            const attachment = attachments[0];
            const attachmentType = String(attachment?.type || 'document');
            if (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'audio' || attachmentType === 'document') {
                messageType = attachmentType;
                mediaType = attachmentType;
            }
            const attachmentPayload = attachment?.payload as Record<string, unknown> | undefined;
            mediaUrl = attachmentPayload?.url as string | undefined;
        }

        const externalId = this.createExternalId('facebook', senderId);

        return {
            message: {
                direction: 'inbound',
                messageType,
                content,
                mediaUrl,
                mediaType,
                externalMessageId: message ? String(message.mid || '') : '',
                status: 'sent',
                metadata: {
                    timestamp: messaging.timestamp,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    senderId,
                    senderName: (sender as Record<string, unknown>).name as string | undefined,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const { pageId, pageAccessToken } = channel.config;

            if (!pageId || !pageAccessToken) {
                return {
                    isValid: false,
                    error: 'Missing page ID or access token',
                };
            }

            // Test API call
            const url = `https://graph.facebook.com/v18.0/${pageId}?fields=name,category&access_token=${pageAccessToken}`;
            const response = await fetch(url);

            if (!response.ok) {
                const data = await response.json();
                return {
                    isValid: false,
                    error: data.error?.message || 'Invalid credentials',
                };
            }

            const data = await response.json();

            return {
                isValid: true,
                details: {
                    name: data.name,
                    category: data.category,
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
