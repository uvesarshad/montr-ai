import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInboxConversation extends Document {
    /** Agency-mode brand scope (B3-4.6.1). Inherited from the channel. */
    brandId?: Types.ObjectId | null;
    channelId: Types.ObjectId; // → InboxChannel
    contactId: Types.ObjectId; // → CrmContact

    // Channel-specific identifier (e.g., WhatsApp contact phone, email thread ID, Instagram sender ID)
    externalId?: string;

    // Assignment
    assignedToId?: Types.ObjectId; // → User (agent)
    assignedAt?: Date;
    assignedById?: Types.ObjectId; // Who assigned it

    /** Active AI bot for this conversation (B3-4.5.5). Suppressed when assignedToId is set. */
    aiBotId?: Types.ObjectId | null;

    // Status
    status: 'open' | 'pending' | 'resolved' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'urgent';

    // Metrics
    firstResponseTime?: number; // Seconds
    averageResponseTime?: number; // Seconds
    totalMessages: number;
    lastMessageAt?: Date;
    lastMessageType?: 'incoming' | 'outgoing';

    // SLA Tracking
    slaDeadline?: Date;
    slaStatus?: 'on_track' | 'at_risk' | 'breached';

    // Tags and notes
    labels?: string[];
    internalNotes?: string;

    // CSAT
    csatRating?: number; // 1-5
    csatFeedback?: string;
    csatSubmittedAt?: Date;

    // Channel-specific metadata
    metadata?: {
        // WhatsApp
        phoneNumber?: string;

        // Email
        threadId?: string;
        subject?: string;

        // Instagram
        senderId?: string;
        senderUsername?: string;

        // Facebook
        senderName?: string;

        // Discord
        channelName?: string;
        userId?: string;
        username?: string;

        // Slack

        // Website
        visitorId?: string;
        visitorName?: string;
        visitorEmail?: string;
        sessionId?: string;

        // Custom fields
        [key: string]: unknown;
    };

    createdAt: Date;
    updatedAt: Date;
}

const InboxConversationSchema = new Schema<IInboxConversation>(
    {
        brandId: {
            type: Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
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
        externalId: {
            type: String,
            index: true,
            sparse: true,
        },
        assignedToId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        assignedAt: Date,
        assignedById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        aiBotId: {
            type: Schema.Types.ObjectId,
            ref: 'AiBot',
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: ['open', 'pending', 'resolved', 'closed'],
            default: 'open',
            index: true,
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium',
            index: true,
        },
        firstResponseTime: Number,
        averageResponseTime: Number,
        totalMessages: {
            type: Number,
            default: 0,
        },
        lastMessageAt: {
            type: Date,
            index: true,
        },
        lastMessageType: {
            type: String,
            enum: ['incoming', 'outgoing'],
        },
        slaDeadline: Date,
        slaStatus: {
            type: String,
            enum: ['on_track', 'at_risk', 'breached'],
        },
        labels: {
            type: [String],
            default: [],
        },
        internalNotes: String,
        csatRating: {
            type: Number,
            min: 1,
            max: 5,
        },
        csatFeedback: String,
        csatSubmittedAt: Date,
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        collection: 'inbox_conversations',
    }
);

// Compound indexes
InboxConversationSchema.index({ channelId: 1, contactId: 1 });
InboxConversationSchema.index({ assignedToId: 1, status: 1 });
InboxConversationSchema.index({ status: 1, priority: -1 });
InboxConversationSchema.index({ lastMessageAt: -1 });
// Agency-mode (B3-4.6.1).
InboxConversationSchema.index({ brandId: 1, lastMessageAt: -1 });
InboxConversationSchema.index({ channelId: 1, externalId: 1 }, { unique: true, sparse: true });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.InboxConversation) {
        delete mongoose.models.InboxConversation;
    }
}

const InboxConversation =
    mongoose.models.InboxConversation || mongoose.model<IInboxConversation>('InboxConversation', InboxConversationSchema);

export default InboxConversation;
