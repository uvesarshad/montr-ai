
import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMarketingSuppression extends Document {
    email: string;
    reason: 'bounced' | 'complained' | 'unsubscribed' | 'manual';

    // Metadata
    campaignId?: Types.ObjectId;
    providerId?: Types.ObjectId;
    source?: string; // e.g. 'webhook', 'user_action'
    notes?: string;

    createdById?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MarketingSuppressionSchema = new Schema<IMarketingSuppression>(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        reason: {
            type: String,
            enum: ['bounced', 'complained', 'unsubscribed', 'manual'],
            required: true,
        },
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: 'MarketingCampaign',
        },
        providerId: {
            type: Schema.Types.ObjectId,
            ref: 'MarketingProvider',
        },
        source: String,
        notes: String,
        createdById: {
            type: Schema.Types.ObjectId, // Optional (system might create it)
            ref: 'User',
        },
    },
    {
        timestamps: true,
        collection: 'marketing_suppressions',
    }
);

// Indexes
MarketingSuppressionSchema.index({ email: 1 }, { unique: true }); // Ensure unique email per org

const MarketingSuppression: Model<IMarketingSuppression> =
    mongoose.models.MarketingSuppression || mongoose.model<IMarketingSuppression>('MarketingSuppression', MarketingSuppressionSchema);

export default MarketingSuppression;
