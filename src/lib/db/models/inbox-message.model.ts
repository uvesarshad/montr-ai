import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInboxMessage extends Document {
    /** Agency-mode brand scope (B3-4.6.1). Denormalized from the conversation. */
    brandId?: Types.ObjectId | null;
    conversationId: Types.ObjectId; // → InboxConversation
    channelId: Types.ObjectId; // → InboxChannel
    contactId: Types.ObjectId; // → CrmContact

    direction: 'inbound' | 'outbound';
    messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'note' | 'template';

    // Content
    content: string; // Text or caption
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    fileName?: string;
    mimeType?: string;
    fileSize?: number;

    // Template info (for WhatsApp/Facebook templates)
    templateId?: Types.ObjectId;
    templateName?: string;
    templateComponents?: unknown[];

    // Status
    status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    externalMessageId?: string; // Channel-specific message ID
    failedReason?: string;

    // Timestamps
    sentAt?: Date;
    deliveredAt?: Date;
    readAt?: Date;

    // Internal notes
    isNote: boolean;
    noteAuthorId?: Types.ObjectId;
    noteAuthorName?: string;

    // Channel-specific metadata
    metadata?: {
        // Email
        messageId?: string;
        inReplyTo?: string;
        references?: string[];
        headers?: Record<string, unknown>;

        // Instagram
        storyId?: string;
        storyUrl?: string;
        isStoryReply?: boolean;

        // Discord

        // Slack
        threadTs?: string;

        // Custom fields
        [key: string]: unknown;
    };

    createdAt: Date;
    updatedAt: Date;
}

const InboxMessageSchema = new Schema<IInboxMessage>(
    {
        brandId: {
            type: Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
            index: true,
        },
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'InboxConversation',
            required: true,
            index: true,
        },
        channelId: {
            type: Schema.Types.ObjectId,
            ref: 'InboxChannel',
            required: true,
            index: true,
        },
        contactId: {
            type: Schema.Types.ObjectId,
            ref: 'CrmContact',
            required: true,
            index: true,
        },
        direction: {
            type: String,
            enum: ['inbound', 'outbound'],
            required: true,
            index: true,
        },
        messageType: {
            type: String,
            enum: ['text', 'image', 'video', 'audio', 'document', 'note', 'template'],
            required: true,
            index: true,
        },
        content: {
            type: String,
            required: true,
        },
        mediaUrl: String,
        mediaType: {
            type: String,
            enum: ['image', 'video', 'audio', 'document'],
        },
        fileName: String,
        mimeType: String,
        fileSize: Number,
        templateId: {
            type: Schema.Types.ObjectId,
        },
        templateName: String,
        templateComponents: [Schema.Types.Mixed],
        status: {
            type: String,
            enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
            default: 'sent',
            index: true,
        },
        externalMessageId: {
            type: String,
            index: true,
            sparse: true,
        },
        failedReason: String,
        sentAt: Date,
        deliveredAt: Date,
        readAt: Date,
        isNote: {
            type: Boolean,
            default: false,
            index: true,
        },
        noteAuthorId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        noteAuthorName: String,
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        collection: 'inbox_messages',
    }
);

// Indexes for performance
InboxMessageSchema.index({ conversationId: 1, createdAt: -1 }); // Get conversation messages
InboxMessageSchema.index({ contactId: 1, createdAt: -1 }); // Get contact messages
InboxMessageSchema.index({ createdAt: -1 }); // Organization messages
InboxMessageSchema.index({ status: 1, createdAt: -1 }); // Failed/pending messages
InboxMessageSchema.index({ channelId: 1, externalMessageId: 1 }, { unique: true, sparse: true }); // Prevent duplicates

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.InboxMessage) {
        delete mongoose.models.InboxMessage;
    }
}

const InboxMessage =
    mongoose.models.InboxMessage || mongoose.model<IInboxMessage>('InboxMessage', InboxMessageSchema);

export default InboxMessage;
