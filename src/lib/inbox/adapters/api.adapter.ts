import { BaseChannelAdapter } from './channel-adapter.interface';
import { IInboxChannel } from '@/lib/db/models/inbox-channel.model';
import { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import crypto from 'crypto';

/**
 * Custom API Channel Adapter
 * Allows integration with any external system via webhooks
 */
export class APIAdapter extends BaseChannelAdapter {
    channelType = 'api' as const;

    getChannelType(): string {
        return 'api';
    }

    /**
     * Send message via custom API
     */
    async sendMessage(params: {
        channel: IInboxChannel;
        conversation: IInboxConversation;
        content: string;
        mediaUrl?: string;
        mediaType?: string;
        fileName?: string;
    }): Promise<{ externalMessageId: string; status: 'sent' | 'failed' }> {
        try {
            const config = params.channel.config as typeof params.channel.config & { apiUrl?: string; apiKey?: string; webhookSecret?: string };

            if (!config.apiUrl || !config.apiKey) {
                throw new Error('API URL and API Key are required');
            }

            // Prepare payload
            const payload = {
                conversationId: params.conversation.externalId,
                message: {
                    content: params.content,
                    mediaUrl: params.mediaUrl,
                    mediaType: params.mediaType,
                    fileName: params.fileName,
                },
                metadata: params.conversation.metadata,
            };

            // Generate signature if secret is configured
            let signature: string | undefined;
            if (config.webhookSecret) {
                const hmac = crypto.createHmac('sha256', config.webhookSecret);
                hmac.update(JSON.stringify(payload));
                signature = hmac.digest('hex');
            }

            // Send to custom API
            const response = await fetch(config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': config.apiKey,
                    ...(signature && { 'X-Signature': signature }),
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const data = await response.json();

            return {
                externalMessageId: data.messageId || crypto.randomUUID(),
                status: 'sent',
            };
        } catch (error: unknown) {
            console.error('Error sending via custom API:', error);
            return {
                externalMessageId: '',
                status: 'failed',
            };
        }
    }

    /**
     * Receive message from custom API webhook
     */
    async receiveMessage(params: import('./channel-adapter.interface').ReceiveMessageParams): Promise<import('./channel-adapter.interface').ReceiveMessageResult> {
        try {
            const config = params.channel.config as typeof params.channel.config & { webhookSecret?: string };

            // Verify webhook signature if secret is configured
            if (config.webhookSecret && params.payload.signature) {
                const hmac = crypto.createHmac('sha256', config.webhookSecret);
                hmac.update(JSON.stringify(params.payload.data || params.payload));
                const expectedSignature = hmac.digest('hex');

                if (expectedSignature !== String(params.payload.signature)) {
                    throw new Error('Invalid webhook signature');
                }
            }

            // Extract data from payload
            const data = (params.payload.data || params.payload) as Record<string, unknown>;
            const message = (data.message || data) as Record<string, unknown>;
            const conversationId = String(data.conversationId || data.userId || crypto.randomUUID());

            // Determine message type
            let messageType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
            const msgMediaUrl = message.mediaUrl as string | undefined;
            const msgMediaType = message.mediaType as string | undefined;
            if (msgMediaUrl) {
                if (msgMediaType === 'image' || msgMediaType === 'video' || msgMediaType === 'audio' || msgMediaType === 'document') {
                    messageType = msgMediaType;
                } else if (msgMediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                    messageType = 'image';
                } else if (msgMediaUrl.match(/\.(mp4|mov|avi|webm)$/i)) {
                    messageType = 'video';
                } else if (msgMediaUrl.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                    messageType = 'audio';
                } else {
                    messageType = 'document';
                }
            }

            const dataMeta = data.metadata as Record<string, unknown> | undefined;
            return {
                conversation: {
                    externalId: `api:${conversationId}`,
                    metadata: {
                        userId: data.userId as string | undefined,
                        userName: data.userName as string | undefined,
                        userEmail: data.userEmail as string | undefined,
                        ...(dataMeta || {}),
                    },
                },
                message: {
                    direction: 'inbound',
                    messageType,
                    content: String(message.content || message.text || ''),
                    mediaUrl: msgMediaUrl,
                    mediaType: messageType !== 'text' ? messageType : undefined,
                    fileName: message.fileName as string | undefined,
                    externalMessageId: String(message.messageId || crypto.randomUUID()),
                    status: 'sent',
                    metadata: message.metadata as Record<string, unknown> | undefined,
                },
                shouldCreateConversation: true,
            };
        } catch (error: unknown) {
            console.error('Error processing custom API webhook:', error);
            throw error;
        }
    }

    /**
     * Validate API credentials
     */
    async validateCredentials(channel: IInboxChannel): Promise<{
        isValid: boolean;
        error?: string;
    }> {
        try {
            const config = channel.config as typeof channel.config & { apiUrl?: string; apiKey?: string };

            if (!config.apiUrl || !config.apiKey) {
                return { isValid: false, error: 'API URL and API Key are required' };
            }

            // Test API connection with a ping request
            const response = await fetch(config.apiUrl, {
                method: 'GET',
                headers: {
                    'X-API-Key': config.apiKey,
                },
            });

            if (!response.ok && response.status !== 404) {
                return { isValid: false, error: `API returned ${response.status}` };
            }

            return { isValid: true };
        } catch (error: unknown) {
            return { isValid: false, error: error instanceof Error ? error.message : 'Validation failed' };
        }
    }

    /**
     * Get display name for channel
     */
    getDisplayName(channel: IInboxChannel): string {
        return channel.name || 'Custom API Channel';
    }

    /**
     * Get channel icon
     */
    getIcon(): string {
        return '🔌';
    }
}
