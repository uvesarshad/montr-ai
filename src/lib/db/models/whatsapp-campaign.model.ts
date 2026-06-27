import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppCampaign extends Document {
    /** Agency-mode brand scope (B3-4.6.1). */
    brandId?: Types.ObjectId | null;
    whatsappAccountId: Types.ObjectId;
    templateId: Types.ObjectId;

    name: string;
    status: 'draft' | 'scheduled' | 'processing' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

    // Message Content
    messageType: 'template' | 'text' | 'media';
    content?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';

    // Scheduling with timezone support
    scheduledAt?: Date;
    timezone?: string; // IANA timezone (e.g., 'America/New_York')
    startedAt?: Date;
    completedAt?: Date;
    pausedAt?: Date;

    // Audience Targeting
    targetType: 'all' | 'groups' | 'individual' | 'filter';
    targetGroups?: Types.ObjectId[]; // Array of group IDs
    targetContacts?: Types.ObjectId[]; // Array of contact IDs
    targetFilter?: Record<string, unknown>; // Custom filter criteria
    totalContacts: number;

    // Template Variables (for variable interpolation)
    templateVariables?: Record<string, string>; // Static variable values

    // Batch Processing
    batchSize: number; // Messages per batch (default: 100)
    delayBetweenBatches: number; // Seconds between batches (default: 60)
    processedCount: number; // Track progress

    // Bot Configuration (campaign can act as bot)
    botEnabled: boolean;
    botTriggers?: string[]; // Keywords that trigger this campaign
    botTriggerType?: 'exact' | 'contains'; // Type 2 or Type 3

    // Stats
    stats: {
        sent: number;
        delivered: number;
        read: number;
        failed: number;
        replied: number;
    };

    // Demo Mode
    isDemo: boolean;

    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppCampaignSchema = new Schema<IWhatsAppCampaign>(
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
        },
        templateId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppTemplate',
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'processing', 'running', 'completed', 'failed', 'cancelled', 'paused'],
            default: 'draft',
            index: true,
        },
        messageType: {
            type: String,
            enum: ['template', 'text', 'media'],
            default: 'template',
        },
        content: String,
        mediaUrl: String,
        mediaType: {
            type: String,
            enum: ['image', 'video', 'audio', 'document'],
        },
        scheduledAt: Date,
        timezone: String,
        startedAt: Date,
        completedAt: Date,
        pausedAt: Date,
        targetType: {
            type: String,
            enum: ['all', 'groups', 'individual', 'filter'],
            default: 'all',
        },
        targetGroups: [{ type: Schema.Types.ObjectId, ref: 'WhatsAppContactGroup' }],
        targetContacts: [{ type: Schema.Types.ObjectId, ref: 'Contact' }],
        targetFilter: Schema.Types.Mixed,
        totalContacts: {
            type: Number,
            default: 0,
        },
        templateVariables: {
            type: Map,
            of: String,
        },
        batchSize: {
            type: Number,
            default: 100,
        },
        delayBetweenBatches: {
            type: Number,
            default: 60,
        },
        processedCount: {
            type: Number,
            default: 0,
        },
        botEnabled: {
            type: Boolean,
            default: false,
        },
        botTriggers: [String],
        botTriggerType: {
            type: String,
            enum: ['exact', 'contains'],
        },
        stats: {
            sent: { type: Number, default: 0 },
            delivered: { type: Number, default: 0 },
            read: { type: Number, default: 0 },
            failed: { type: Number, default: 0 },
            replied: { type: Number, default: 0 },
        },
        isDemo: {
            type: Boolean,
            default: false,
        },
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'whatsapp_campaigns',
    }
);

// Indexes
WhatsAppCampaignSchema.index({ status: 1 });
WhatsAppCampaignSchema.index({ brandId: 1, status: 1 }); // B3-4.6.1
WhatsAppCampaignSchema.index({ createdAt: -1 });
WhatsAppCampaignSchema.index({ status: 1, scheduledAt: 1 }); // For scheduled campaign processing
WhatsAppCampaignSchema.index({ botEnabled: 1, status: 1 }); // For bot campaigns

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppCampaign) {
        delete mongoose.models.WhatsAppCampaign;
    }
}

const WhatsAppCampaign: Model<IWhatsAppCampaign> =
    mongoose.models.WhatsAppCampaign || mongoose.model<IWhatsAppCampaign>('WhatsAppCampaign', WhatsAppCampaignSchema);

export default WhatsAppCampaign;
