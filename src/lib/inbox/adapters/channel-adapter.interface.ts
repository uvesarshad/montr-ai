import { IInboxChannel } from '@/lib/db/models/inbox-channel.model';
import { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import { IInboxMessage } from '@/lib/db/models/inbox-message.model';

export interface SendMessageParams {
    channel: IInboxChannel;
    conversation: IInboxConversation;
    content: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    fileName?: string;
}

export interface SendMessageResult {
    externalMessageId: string;
    status: 'sent' | 'failed';
    error?: string;
}

export interface ReceiveMessageParams {
    channel: IInboxChannel;
    payload: Record<string, unknown>; // Webhook payload (channel-specific)
}

export interface ReceiveMessageResult {
    message: Partial<IInboxMessage>;
    conversation: Partial<IInboxConversation>;
    shouldCreateConversation: boolean;
}

export interface ValidateCredentialsResult {
    isValid: boolean;
    error?: string;
    details?: Record<string, unknown>;
}

/**
 * Base interface for all channel adapters
 * Each channel (WhatsApp, Instagram, Facebook, etc.) implements this interface
 */
export interface IChannelAdapter {
    /**
     * Send a message through this channel
     */
    sendMessage(params: SendMessageParams): Promise<SendMessageResult>;

    /**
     * Receive and process incoming message from webhook
     * Returns message data and conversation data
     */
    receiveMessage(params: ReceiveMessageParams): Promise<ReceiveMessageResult>;

    /**
     * Validate channel credentials (test connection)
     */
    validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult>;

    /**
     * Get channel-specific display name
     */
    getDisplayName(channel: IInboxChannel): string;

    /**
     * Get channel type identifier
     */
    getChannelType(): string;
}

/**
 * Base abstract class with common functionality
 */
export abstract class BaseChannelAdapter implements IChannelAdapter {
    abstract sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
    abstract receiveMessage(params: ReceiveMessageParams): Promise<ReceiveMessageResult>;
    abstract validateCredentials(channel: IInboxChannel): Promise<ValidateCredentialsResult>;
    abstract getDisplayName(channel: IInboxChannel): string;
    abstract getChannelType(): string;

    /**
     * Helper: Create conversation external ID
     */
    protected createExternalId(channelType: string, identifier: string): string {
        return `${channelType}:${identifier}`;
    }

    /**
     * Helper: Parse external ID
     */
    protected parseExternalId(externalId: string): { channelType: string; identifier: string } {
        const [channelType, identifier] = externalId.split(':');
        return { channelType, identifier };
    }
}
