import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMessage {
    role: 'user' | 'assistant';
    content: string;
    model?: string;
    timestamp: Date;
}

export interface IConversation extends Document {
    userId: string;
    title: string;
    lastMessage?: string;
    lastModel?: string;
    lastModelRouteHint?: {
        sdk: string;
        provider: string;
        keySource: string;
    };
    messages: IMessage[];
    conversationSummary?: string;
    lastSummarizedIndex?: number;
    isArchived: boolean;
    type: 'text' | 'image' | 'video' | 'audio' | 'character';
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
    {
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        model: {
            type: String,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            default: 'New Chat',
        },
        lastMessage: {
            type: String,
            default: null,
        },
        lastModel: {
            type: String,
            default: null,
        },
        lastModelRouteHint: {
            type: Schema.Types.Mixed,
            default: null,
        },
        messages: {
            type: [MessageSchema],
            default: [],
        },
        conversationSummary: {
            type: String,
            default: null,
        },
        lastSummarizedIndex: {
            type: Number,
            default: -1,
        },
        isArchived: {
            type: Boolean,
            default: false,
        },
        type: {
            type: String,
            enum: ['text', 'image', 'video', 'audio', 'character'],
            default: 'text',
            required: true,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'conversations',
    }
);

// Indexes
ConversationSchema.index({ userId: 1, updatedAt: -1 });
ConversationSchema.index({ userId: 1, isArchived: 1, updatedAt: -1 });
ConversationSchema.index({ userId: 1, title: 'text' });

// Prevent model recompilation in development
const Conversation: Model<IConversation> =
    mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);

export default Conversation;
