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
 * Website Chatbot Channel Adapter
 * Uses WebSocket for real-time communication
 */
export class WebsiteAdapter extends BaseChannelAdapter {
    getChannelType(): string {
        return 'website';
    }

    getDisplayName(channel: IInboxChannel): string {
        return channel.config.websiteUrl || channel.name;
    }

    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        const { channel: _channel, conversation, content: _content, mediaUrl: _mediaUrl, mediaType: _mediaType } = params;

        try {
            const sessionId = conversation.metadata?.sessionId;

            if (!sessionId) {
                throw new Error('Missing session ID');
            }

            // Send message via WebSocket
            // This will be handled by the WebSocket server
            // For now, we'll return success and the actual sending happens via WebSocket emit

            return {
                externalMessageId: `ws-${Date.now()}`,
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

        // Parse WebSocket message payload
        const sessionId = payload.sessionId as string | undefined;
        const visitorId = payload.visitorId as string | undefined;
        const visitorName = payload.visitorName as string | undefined;
        const visitorEmail = payload.visitorEmail as string | undefined;
        const content = payload.content as string | undefined;
        const messageType = (payload.messageType as string | undefined) || 'text';
        const mediaUrl = payload.mediaUrl as string | undefined;

        if (!sessionId || !content) {
            throw new Error('Invalid website chatbot message');
        }

        const externalId = this.createExternalId('website', sessionId);

        return {
            message: {
                direction: 'inbound',
                messageType: messageType as 'text' | 'image' | 'video' | 'audio' | 'document',
                content,
                mediaUrl,
                externalMessageId: `ws-${Date.now()}`,
                status: 'sent',
                metadata: {
                    sessionId,
                },
            },
            conversation: {
                externalId,
                metadata: {
                    visitorId,
                    visitorName,
                    visitorEmail,
                    sessionId,
                },
            },
            shouldCreateConversation: true,
        };
    }

    async validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult> {
        try {
            const { websiteUrl, widgetToken } = channel.config;

            if (!websiteUrl || !widgetToken) {
                return {
                    isValid: false,
                    error: 'Missing website URL or widget token',
                };
            }

            // Website chatbot doesn't need external validation
            // Token is generated internally
            return {
                isValid: true,
                details: {
                    websiteUrl,
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
