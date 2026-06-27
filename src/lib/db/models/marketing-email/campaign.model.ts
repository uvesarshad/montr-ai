
import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMarketingCampaign extends Document {
    providerId?: Types.ObjectId;
    templateId?: Types.ObjectId;

    name: string;
    subject?: string;
    previewText?: string;

    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed' | 'completed' | 'cancelled';

    // Content (snapshot at send time or override)
    htmlContent?: string;
    textContent?: string;

    // Audience
    targetType: 'all_contacts' | 'segment' | 'tags' | 'custom_filter';
    targetTags: Types.ObjectId[];
    targetFilter?: Record<string, unknown>;
    excludeTags: Types.ObjectId[];
    totalRecipients: number;

    // Scheduling
    scheduledAt?: Date;
    timezone?: string;
    startedAt?: Date;
    completedAt?: Date;

    // Batch Processing
    batchSize: number;
    delayBetweenBatches: number; // in seconds
    processedCount: number;

    // Stats
    stats: {
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        bounced: number;
        complained: number;
        unsubscribed: number;
    };

    // A/B Testing
    isABTest: boolean;
    variantA?: {
        subject?: string;
        templateId?: Types.ObjectId;
        weight?: number; // percentage (0-100)
    };
    variantB?: {
        subject?: string;
        templateId?: Types.ObjectId;
        weight?: number;
    };
    // Per-variant stats (populated after campaign completes)
    variantStats?: {
        A: { sent: number; opened: number; clicked: number; openRate: string; clickRate: string };
        B: { sent: number; opened: number; clicked: number; openRate: string; clickRate: string };
        winner?: 'A' | 'B' | 'tie';
    };

    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MarketingCampaignSchema = new Schema<IMarketingCampaign>(
    {
        providerId: {
            type: Schema.Types.ObjectId,
            ref: 'MarketingProvider',
        },
        templateId: {
            type: Schema.Types.ObjectId,
            ref: 'MarketingTemplate',
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        subject: String,
        previewText: String,
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'sending', 'sent', 'paused', 'failed', 'completed', 'cancelled'],
            default: 'draft',
            index: true,
        },
        htmlContent: String,
        textContent: String,
        targetType: {
            type: String,
            enum: ['all_contacts', 'segment', 'tags', 'custom_filter'],
            default: 'tags',
        },
        targetTags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
        targetFilter: Schema.Types.Mixed,
        excludeTags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
        totalRecipients: {
            type: Number,
            default: 0,
        },
        scheduledAt: Date,
        timezone: String,
        startedAt: Date,
        completedAt: Date,
        batchSize: {
            type: Number,
            default: 100, // Default batch size
        },
        delayBetweenBatches: {
            type: Number,
            default: 0, // No delay by default
        },
        processedCount: {
            type: Number,
            default: 0,
        },
        stats: {
            sent: { type: Number, default: 0 },
            delivered: { type: Number, default: 0 },
            opened: { type: Number, default: 0 },
            clicked: { type: Number, default: 0 },
            bounced: { type: Number, default: 0 },
            complained: { type: Number, default: 0 },
            unsubscribed: { type: Number, default: 0 },
        },
        isABTest: {
            type: Boolean,
            default: false,
        },
        variantA: {
            subject: String,
            templateId: { type: Schema.Types.ObjectId, ref: 'MarketingTemplate' },
            weight: { type: Number, default: 50 },
        },
        variantB: {
            subject: String,
            templateId: { type: Schema.Types.ObjectId, ref: 'MarketingTemplate' },
            weight: { type: Number, default: 50 },
        },
        variantStats: {
            A: {
                sent: { type: Number, default: 0 },
                opened: { type: Number, default: 0 },
                clicked: { type: Number, default: 0 },
                openRate: { type: String, default: '0.00' },
                clickRate: { type: String, default: '0.00' },
            },
            B: {
                sent: { type: Number, default: 0 },
                opened: { type: Number, default: 0 },
                clicked: { type: Number, default: 0 },
                openRate: { type: String, default: '0.00' },
                clickRate: { type: String, default: '0.00' },
            },
            winner: { type: String, enum: ['A', 'B', 'tie'] },
        },
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'marketing_campaigns',
    }
);

// Indexes
MarketingCampaignSchema.index({ status: 1 });
MarketingCampaignSchema.index({ createdAt: -1 });

const MarketingCampaign: Model<IMarketingCampaign> =
    mongoose.models.MarketingCampaign || mongoose.model<IMarketingCampaign>('MarketingCampaign', MarketingCampaignSchema);

export default MarketingCampaign;
