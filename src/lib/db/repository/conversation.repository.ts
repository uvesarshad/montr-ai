import mongoose from 'mongoose';
import Conversation, { IConversation, IMessage } from '../models/conversation.model';

export interface CreateConversationDto {
    userId: string;
    title?: string;
    messages?: IMessage[];
    lastModel?: string;
    lastModelRouteHint?: object;
    type?: 'text' | 'image' | 'video' | 'audio' | 'character';
}

export interface UpdateConversationDto {
    title?: string;
    lastMessage?: string;
    lastModel?: string;
    lastModelRouteHint?: object;
    messages?: IMessage[];
    conversationSummary?: string;
    lastSummarizedIndex?: number;
    isArchived?: boolean;
}

export interface FindConversationsOptions {
    search?: string;
    archived?: boolean;
    limit?: number;
    offset?: number;
    type?: string;
}

export class ConversationRepository {
    /**
     * Find all conversations for a user with optional filtering
     */
    async findByUserId(
        userId: string,
        options: FindConversationsOptions = {},
        firebaseUid?: string
    ): Promise<IConversation[]> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        const query: Record<string, unknown> = { userId: { $in: userIds } };

        // Filter by archived status
        if (options.archived !== undefined) {
            query.isArchived = options.archived;
        }

        // Filter by type (default to text if not specified, OR return all? Usually we want to filter)
        // If options.type is provided, filter by it.
        if (options.type) {
            query.type = options.type;
        }

        // Search by title (case-insensitive)
        if (options.search) {
            query.title = { $regex: options.search, $options: 'i' };
        }

        let findQuery = Conversation.find(query).sort({ updatedAt: -1 });

        if (options.limit) {
            findQuery = findQuery.limit(options.limit);
        }
        if (options.offset) {
            findQuery = findQuery.skip(options.offset);
        }

        return findQuery.exec();
    }

    /**
     * Find conversation by ID
     */
    async findById(conversationId: string, userId: string, firebaseUid?: string): Promise<IConversation | null> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return Conversation.findOne({ _id: conversationId, userId: { $in: userIds } }).exec();
    }

    /**
     * Create new conversation
     */
    async create(data: CreateConversationDto): Promise<IConversation> {
        await this.ensureConnection();

        const conversation = new Conversation({
            userId: data.userId,
            title: data.title || 'New Chat',
            messages: data.messages || [],
            lastModel: data.lastModel,
            lastModelRouteHint: data.lastModelRouteHint,
            type: data.type || 'text',
        });

        return conversation.save();
    }

    /**
     * Update conversation
     */
    async update(
        conversationId: string,
        userId: string,
        data: UpdateConversationDto,
        firebaseUid?: string
    ): Promise<IConversation | null> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return Conversation.findOneAndUpdate(
            { _id: conversationId, userId: { $in: userIds } },
            { $set: data },
            { new: true }
        ).exec();
    }

    /**
     * Add message to conversation
     */
    async addMessage(
        conversationId: string,
        userId: string,
        message: IMessage,
        firebaseUid?: string
    ): Promise<IConversation | null> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        const setFields: Record<string, unknown> = {
            lastMessage: message.content.substring(0, 100),
        };

        if (message.model) {
            setFields.lastModel = message.model;
        }

        const updateData: Record<string, unknown> = {
            $push: { messages: message },
            $set: setFields,
        };

        return Conversation.findOneAndUpdate(
            { _id: conversationId, userId: { $in: userIds } },
            updateData,
            { new: true }
        ).exec();
    }

    /**
     * Delete conversation
     */
    async delete(conversationId: string, userId: string, firebaseUid?: string): Promise<boolean> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        const result = await Conversation.deleteOne({
            _id: conversationId,
            userId: { $in: userIds },
        }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Duplicate conversation
     */
    async duplicate(conversationId: string, userId: string, firebaseUid?: string): Promise<IConversation | null> {
        await this.ensureConnection();

        const original = await this.findById(conversationId, userId, firebaseUid);
        if (!original) {
            return null;
        }

        const duplicated = new Conversation({
            userId: original.userId,
            title: `${original.title} (Copy)`,
            messages: original.messages,
            lastMessage: original.lastMessage,
            lastModel: original.lastModel,
            lastModelRouteHint: original.lastModelRouteHint,
            conversationSummary: original.conversationSummary,
            lastSummarizedIndex: original.lastSummarizedIndex,
            isArchived: false,
        });

        return duplicated.save();
    }

    /**
     * Count conversations for a user
     */
    async countByUserId(userId: string, options: { archived?: boolean; type?: string } = {}, firebaseUid?: string): Promise<number> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        const query: Record<string, unknown> = { userId: { $in: userIds } };
        if (options.archived !== undefined) {
            query.isArchived = options.archived;
        }
        if (options.type) {
            query.type = options.type;
        }

        return Conversation.countDocuments(query).exec();
    }

    /**
     * Ensure MongoDB connection via Mongoose
     */
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

// Export singleton instance
export const conversationRepository = new ConversationRepository();
