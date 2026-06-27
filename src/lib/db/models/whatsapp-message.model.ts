import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppMessage extends Document {
    /** Agency-mode brand scope (B3-4.6.1). Denormalized from the account. */
    brandId?: Types.ObjectId | null;
    whatsappAccountId: Types.ObjectId;
    contactId: Types.ObjectId;
    campaignId?: Types.ObjectId;

    // Message Details
    direction: 'inbound' | 'outbound';
    messageType: 'text' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'note';

    // Content
    content: string; // Text content or caption
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    fileName?: string;
    mimeType?: string;

    // Template Info (if template message)
    templateId?: Types.ObjectId;
    templateName?: string;
    components?: unknown[]; // Template components with filled variables

    // Status Tracking
    status: 'scheduled' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    fbMessageId?: string; // WhatsApp API message ID
    failedReason?: string;

    // Timestamps
    scheduledFor?: Date;
    sentAt?: Date;
    deliveredAt?: Date;
    readAt?: Date;

    // Retry Logic
    retryCount: number;
    maxRetries: number;
    nextRetryAt?: Date;

    // Note Specific
    isNote: boolean; // Internal notes not sent to WhatsApp
    noteAuthorId?: Types.ObjectId;
    noteAuthorName?: string;

    // Extra metadata
    extra?: Record<string, unknown>; // For external references or additional data

    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppMessageSchema = new Schema<IWhatsAppMessage>(
    {
        brandId: {
            type: Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
            index: true,
        },
        whatsappAccountId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppAccount',
            required: true,
            index: true,
        },
        contactId: {
            type: Schema.Types.ObjectId,
            ref: 'Contact',
            required: true,
            index: true,
        },
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppCampaign',
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
            enum: ['text', 'template', 'image', 'video', 'audio', 'document', 'note'],
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
        templateId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppTemplate',
        },
        templateName: String,
        components: [Schema.Types.Mixed],
        status: {
            type: String,
            enum: ['scheduled', 'sending', 'sent', 'delivered', 'read', 'failed'],
            default: 'sent',
            index: true,
        },
        fbMessageId: {
            type: String,
            index: true,
            sparse: true,
        },
        failedReason: String,
        scheduledFor: Date,
        sentAt: Date,
        deliveredAt: Date,
        readAt: Date,
        retryCount: {
            type: Number,
            default: 0,
        },
        maxRetries: {
            type: Number,
            default: 3,
        },
        nextRetryAt: Date,
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
        extra: Schema.Types.Mixed,
    },
    {
        timestamps: true,
        collection: 'whatsapp_messages',
    }
);

// Indexes for performance
WhatsAppMessageSchema.index({ contactId: 1, createdAt: -1 }); // Get contact messages
WhatsAppMessageSchema.index({ createdAt: -1 }); // Organization messages
WhatsAppMessageSchema.index({ brandId: 1, createdAt: -1 }); // Brand-scoped (B3-4.6.1)
WhatsAppMessageSchema.index({ campaignId: 1, status: 1 }); // Campaign stats
WhatsAppMessageSchema.index({ status: 1, scheduledFor: 1 }); // Scheduled messages
WhatsAppMessageSchema.index({ status: 1, nextRetryAt: 1 }); // Failed message retries

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppMessage) {
        delete mongoose.models.WhatsAppMessage;
    }
}

const WhatsAppMessage: Model<IWhatsAppMessage> =
    mongoose.models.WhatsAppMessage || mongoose.model<IWhatsAppMessage>('WhatsAppMessage', WhatsAppMessageSchema);

export default WhatsAppMessage;
