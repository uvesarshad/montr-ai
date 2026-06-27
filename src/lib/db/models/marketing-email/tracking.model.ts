
import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMarketingTracking extends Document {
    campaignId: Types.ObjectId;
    contactId?: Types.ObjectId;
    workflowId?: Types.ObjectId;
    executionId?: Types.ObjectId;

    email: string;
    messageId?: string; // Provider's message ID (e.g. SES Message ID)
    providerId: Types.ObjectId;

    // Events
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    bouncedAt?: Date;
    complainedAt?: Date;
    unsubscribedAt?: Date;

    // Event Details
    bounceType?: 'hard' | 'soft';
    bounceReason?: string;
    complaintType?: string;

    clickedUrls: {
        url: string;
        clickedAt: Date;
        userAgent?: string;
        ipAddress?: string;
    }[];

    openCount: number;
    clickCount: number;

    // User Agent
    lastUserAgent?: string;
    lastIpAddress?: string;

    createdAt: Date;
    updatedAt: Date;
}

const MarketingTrackingSchema = new Schema<IMarketingTracking>(
    {
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: 'MarketingCampaign',
            required: true,
            index: true,
        },
        contactId: {
            type: Schema.Types.ObjectId,
            ref: 'Contact',
            index: true,
        },
        workflowId: {
            type: Schema.Types.ObjectId,
            ref: 'UnifiedWorkflow',
            index: true,
        },
        executionId: {
            type: Schema.Types.ObjectId,
            ref: 'UnifiedWorkflowExecution',
            index: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            index: true,
        },
        messageId: {
            type: String,
        },
        providerId: {
            type: Schema.Types.ObjectId,
            ref: 'MarketingProvider',
            required: true,
        },
        sentAt: Date,
        deliveredAt: Date,
        openedAt: Date,
        clickedAt: Date,
        bouncedAt: Date,
        complainedAt: Date,
        unsubscribedAt: Date,
        bounceType: {
            type: String,
            enum: ['hard', 'soft'],
        },
        bounceReason: String,
        complaintType: String,
        clickedUrls: [
            {
                url: String,
                clickedAt: Date,
                userAgent: String,
                ipAddress: String,
            }
        ],
        openCount: {
            type: Number,
            default: 0,
        },
        clickCount: {
            type: Number,
            default: 0,
        },
        lastUserAgent: String,
        lastIpAddress: String,
    },
    {
        timestamps: true,
        collection: 'marketing_tracking',
    }
);

// Indexes
MarketingTrackingSchema.index({ campaignId: 1, status: 1 });
MarketingTrackingSchema.index({ messageId: 1 }); // Lookups from webhooks

const MarketingTracking: Model<IMarketingTracking> =
    mongoose.models.MarketingTracking || mongoose.model<IMarketingTracking>('MarketingTracking', MarketingTrackingSchema);

export default MarketingTracking;
