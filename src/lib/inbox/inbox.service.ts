import { Types } from 'mongoose';
import InboxChannel, { IInboxChannel } from '@/lib/db/models/inbox-channel.model';
import InboxConversation, { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import InboxMessage, { IInboxMessage } from '@/lib/db/models/inbox-message.model';
import { adapterRegistry } from './adapters/adapter-registry';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/**
 * Inbox Service
 * Core service for managing inbox channels, conversations, and messages
 */
export const inboxService = {
    /**
     * Create a new inbox channel
     */
    async createChannel(params: {
        name: string;
        channelType: IInboxChannel['channelType'];
        config: IInboxChannel['config'];
        createdById: Types.ObjectId;
    }): Promise<IInboxChannel> {
        const channel = await InboxChannel.create(params);

        // Validate credentials
        const adapter = adapterRegistry.getAdapter(params.channelType);
        const validation = await adapter.validateCredentials(channel);

        if (!validation.isValid) {
            await InboxChannel.deleteOne({ _id: channel._id });
            throw new Error(`Channel validation failed: ${validation.error}`);
        }

        return channel;
    },

    /**
     * Get or create conversation
     */
    async getOrCreateConversation(params: {
        channelId: Types.ObjectId;
        contactId: Types.ObjectId;
        externalId?: string;
        metadata?: Record<string, unknown>;
    }): Promise<IInboxConversation> {
        let conversation = await InboxConversation.findOne({
            channelId: params.channelId,
            externalId: params.externalId,
        });

        if (!conversation) {
            conversation = await InboxConversation.create({
                ...params,
                status: 'open',
                priority: 'medium',
                totalMessages: 0,
            });
        }

        return conversation;
    },

    /**
     * Create a new message
     */
    async createMessage(params: {
        conversationId: Types.ObjectId;
        channelId: Types.ObjectId;
        contactId: Types.ObjectId;
        direction: 'inbound' | 'outbound';
        messageType: IInboxMessage['messageType'];
        content: string;
        mediaUrl?: string;
        mediaType?: IInboxMessage['mediaType'];
        fileName?: string;
        externalMessageId?: string;
        status?: IInboxMessage['status'];
        metadata?: Record<string, unknown>;
        isNote?: boolean;
        noteAuthorId?: Types.ObjectId;
        noteAuthorName?: string;
    }): Promise<IInboxMessage> {
        const message = await InboxMessage.create({
            ...params,
            isNote: params.isNote || false,
            status: params.status || 'sent',
        });

        // Update conversation metrics
        await InboxConversation.findByIdAndUpdate(params.conversationId, {
            $inc: { totalMessages: 1 },
            lastMessageAt: new Date(),
            lastMessageType: params.direction === 'inbound' ? 'incoming' : 'outgoing',
        });

        return message;
    },

    /**
     * Send a message through a channel
     */
    async sendMessage(params: {
        conversationId: Types.ObjectId;
        content: string;
        mediaUrl?: string;
        mediaType?: 'image' | 'video' | 'audio' | 'document';
        fileName?: string;
    }): Promise<IInboxMessage> {
        // Get conversation and channel
        const conversation = await InboxConversation.findById(params.conversationId);
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        const channel = await InboxChannel.findById(conversation.channelId);
        if (!channel) {
            throw new Error('Channel not found');
        }

        // Get adapter
        const adapter = adapterRegistry.getAdapter(channel.channelType);

        // Send via adapter
        const result = await adapter.sendMessage({
            channel,
            conversation,
            content: params.content,
            mediaUrl: params.mediaUrl,
            mediaType: params.mediaType,
            fileName: params.fileName,
        });

        // Create message record
        const message = await this.createMessage({
            conversationId: conversation._id,
            channelId: channel._id,
            contactId: conversation.contactId,
            direction: 'outbound',
            messageType: params.mediaType || 'text',
            content: params.content,
            mediaUrl: params.mediaUrl,
            mediaType: params.mediaType,
            fileName: params.fileName,
            externalMessageId: result.externalMessageId,
            status: result.status === 'sent' ? 'sent' : 'failed',
        });

        return message;
    },

    /**
     * Receive and process incoming message from webhook
     */
    async receiveMessage(params: {
        channelId: Types.ObjectId;
        payload: Record<string, unknown>;
    }): Promise<{ conversation: IInboxConversation; message: IInboxMessage }> {
        // Get channel
        const channel = await InboxChannel.findById(params.channelId);
        if (!channel) {
            throw new Error('Channel not found');
        }

        // Get adapter
        const adapter = adapterRegistry.getAdapter(channel.channelType);

        // Parse message via adapter
        const result = await adapter.receiveMessage({
            channel,
            payload: params.payload,
        });

        // Get or create conversation
        const conversation = await this.getOrCreateConversation({
            channelId: channel._id,
            contactId: result.conversation.contactId || new Types.ObjectId(), // TODO: Link to actual contact
            externalId: result.conversation.externalId,
            metadata: result.conversation.metadata,
        });

        // Create message
        const message = await this.createMessage({
            conversationId: conversation._id,
            channelId: channel._id,
            contactId: conversation.contactId,
            direction: result.message.direction || 'inbound',
            messageType: result.message.messageType || 'text',
            content: result.message.content || '',
            mediaUrl: result.message.mediaUrl,
            mediaType: result.message.mediaType,
            fileName: result.message.fileName,
            externalMessageId: result.message.externalMessageId,
            status: result.message.status || 'sent',
            metadata: result.message.metadata,
        });

        // Phase 2 (2026-06-05): inbound-channel event for agent mission
        // triggers. Carries ownership so triggered missions can avoid
        // double-handling bot/human threads.
        if ((result.message.direction || 'inbound') === 'inbound') {
            try {
                publishDomainEvent({
                    type: 'message.received',
                    brandId: channel.brandId ? String(channel.brandId) : undefined,
                    source: 'inbox.service',
                    payload: {
                        conversationId: String(conversation._id),
                        messageId: String(message._id),
                        channelId: String(channel._id),
                        channelType: channel.channelType,
                        contactId: conversation.contactId ? String(conversation.contactId) : null,
                        humanAssigned: !!conversation.assignedToId,
                        botHandled: !!channel.aiBotId,
                        preview: (result.message.content ?? '').slice(0, 200),
                    },
                });
            } catch (err) {
                console.error('[Inbox] domain event publish failed:', err);
            }
        }

        // AI bot routing (B3-4.5.5): only on inbound text messages, when the
        // channel has an aiBotId AND no human has claimed the conversation.
        if (
            (result.message.direction || 'inbound') === 'inbound' &&
            channel.aiBotId &&
            !conversation.assignedToId &&
            conversation.status !== 'closed' &&
            (result.message.content ?? '').trim()
        ) {
            void this.runInboxBotTurn({
                botId: String(channel.aiBotId),
                brandId: channel.brandId ? String(channel.brandId) : null,
                conversationId: String(conversation._id),
                channelId: String(channel._id),
                contactId: String(conversation.contactId),
                inboundMessage: String(result.message.content ?? ''),
            }).catch((err) => {
                console.error('[inbox.receiveMessage] bot turn dispatch failed:', err);
            });
        }

        return { conversation, message };
    },

    /**
     * Run a single AI bot turn for an inbox channel inbound message.
     * Best-effort: failures are logged, not surfaced to the caller.
     */
    async runInboxBotTurn(params: {
        botId: string;
        brandId?: string | null;
        conversationId: string;
        channelId: string;
        contactId: string;
        inboundMessage: string;
    }): Promise<void> {
        const { runAiBotTurn } = await import('@/lib/ai-bots/runtime');
        const { createInboxSender } = await import('@/lib/ai-bots/senders/inbox-sender');
        const sender = createInboxSender({
            brandId: params.brandId,
            conversationId: params.conversationId,
            channelId: params.channelId,
            contactId: params.contactId,
            aiBotId: params.botId,
        });
        await runAiBotTurn({
            botId: params.botId,
            channel: 'inbox',
            conversationId: params.conversationId,
            brandId: params.brandId,
            contactId: params.contactId,
            inboundMessage: params.inboundMessage,
            sender,
        });
    },

    /**
     * Assign conversation to agent
     */
    async assignConversation(params: {
        conversationId: Types.ObjectId;
        assignedToId: Types.ObjectId;
        assignedById: Types.ObjectId;
    }): Promise<IInboxConversation> {
        const conversation = await InboxConversation.findByIdAndUpdate(
            params.conversationId,
            {
                assignedToId: params.assignedToId,
                assignedById: params.assignedById,
                assignedAt: new Date(),
            },
            { new: true }
        );

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        return conversation;
    },

    /**
     * Update conversation status
     */
    async updateConversationStatus(params: {
        conversationId: Types.ObjectId;
        status: IInboxConversation['status'];
    }): Promise<IInboxConversation> {
        const conversation = await InboxConversation.findByIdAndUpdate(
            params.conversationId,
            { status: params.status },
            { new: true }
        );

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        return conversation;
    },

    /**
     * Get conversations with filters
     */
    async getConversations(params: {
        channelId?: Types.ObjectId;
        status?: IInboxConversation['status'];
        assignedToId?: Types.ObjectId;
        limit?: number;
        skip?: number;
    }): Promise<{ conversations: IInboxConversation[]; total: number }> {
        const filter: Record<string, unknown> = { };

        if (params.channelId) filter.channelId = params.channelId;
        if (params.status) filter.status = params.status;
        if (params.assignedToId) filter.assignedToId = params.assignedToId;

        const [conversations, total] = await Promise.all([
            InboxConversation.find(filter)
                .sort({ lastMessageAt: -1 })
                .limit(params.limit || 50)
                .skip(params.skip || 0)
                .populate('channelId')
                .populate('contactId')
                .populate('assignedToId'),
            InboxConversation.countDocuments(filter),
        ]);

        return { conversations, total };
    },

    /**
     * Get messages for a conversation
     */
    async getMessages(params: {
        conversationId: Types.ObjectId;
        limit?: number;
        skip?: number;
    }): Promise<IInboxMessage[]> {
        const messages = await InboxMessage.find({ conversationId: params.conversationId })
            .sort({ createdAt: 1 })
            .limit(params.limit || 100)
            .skip(params.skip || 0);

        return messages;
    },
};
