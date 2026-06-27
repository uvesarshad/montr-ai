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
 * Instagram DM Channel Adapter
 * Uses Meta Graph API (Instagram Messaging)
 */
export class InstagramAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'instagram';
    }

    getDisplayName(channel: IInboxChannel): string {
        return `@${channel.config.instagramId || channel.name}`;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel, conversation, content, mediaUrl, mediaType } = params;

        try {
            const instagramId = channel.config.instagramId;
            const accessToken = channel.config.pageAccessToken;
            const recipientId = conversation.metadata?.senderId;

            if (!instagramId || !accessToken || !recipientId) {
                throw new Error('Missing required Instagram configuration');
            }

            const url = `https://graph.facebook.com/v18.0/${instagramId}/messages`;

            const messagePayload: Record<string, unknown> = {
                recipient: { id: recipientId },
            };

            // Handle media messages
            if (mediaUrl && mediaType === 'image') {
                messagePayload.message = {
                    attachment: {
                        type: 'image',
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
                throw new Error(data.error?.message || 'Failed to send Instagram message');
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

        // Parse Meta webhook payload (similar structure to Messenger)
        const entries = payload.entry as Array<Record<string, unknown>> | undefined;
        const entry = entries?.[0];
        const messagingList = entry?.messaging as Array<Record<string, unknown>> | undefined;
        const messaging = messagingList?.[0];

        if (!messaging) {
            throw new Error('Invalid Instagram webhook payload');
        }

        const sender = messaging.sender as Record<string, unknown>;
        const senderId = String(sender.id || '');
        const message = messaging.message as Record<string, unknown> | undefined;

        let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
        let content = '';
        let mediaUrl: string | undefined;
        let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;
        let isStoryReply = false;
        let storyId: string | undefined;

        // Handle story mentions/replies
        if (message?.is_echo) {
            // Skip echo messages (our own messages)
            throw new Error('Echo message, skipping');
        }

        const replyTo = message?.reply_to as Record<string, unknown> | undefined;
        if (replyTo?.story) {
            isStoryReply = true;
            const story = replyTo.story as Record<string, unknown>;
            storyId = String(story.id || '');
        }

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

        const externalId = this.createExternalId('instagram', senderId);

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
                    isStoryReply,
                    storyId,
                    timestamp: messaging.timestamp,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    senderId,
                    isStoryReply,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const { instagramId, pageAccessToken } = channel.config;

            if (!instagramId || !pageAccessToken) {
                return {
                    isValid: false,
                    error: 'Missing Instagram ID or page access token',
                };
            }

            // Test API call
            const url = `https://graph.facebook.com/v18.0/${instagramId}?fields=username,name&access_token=${pageAccessToken}`;
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
                    username: data.username,
                    name: data.name,
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
