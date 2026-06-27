import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Credit Usage Schema
 * 
 * Tracks credit usage per user per billing period.
 * Credits are shared between AI models and scraping services.
 */

export interface ICreditUsageHistory {
    timestamp: Date;
    modelId: string;
    modelName?: string;
    creditsUsed: number;
    requestType: 'text' | 'image' | 'video' | 'audio' | 'scraping';
    usingByok: boolean;
}

export interface ICreditUsage extends Document {
    /** User ID */
    userId: string;
    /** Billing period start date */
    periodStart: Date;
    /** Billing period end date */
    periodEnd: Date;

    /** Total credits allocated for this period */
    creditsAllocated: number;
    /** Credits used so far */
    creditsUsed: number;
    /** Bonus credits (don't expire) */
    bonusCredits: number;
    /** Bonus credits used */
    bonusCreditsUsed: number;

    /** Usage breakdown by type */
    usageByType: {
        text: number;
        image: number;
        video: number;
        audio: number;
        scraping: number;
    };

    /** Recent usage history (last 100 entries) */
    usageHistory: ICreditUsageHistory[];

    /** Last request timestamp */
    lastRequestAt?: Date;

    /** Timestamps */
    createdAt: Date;
    updatedAt: Date;
}

const CreditUsageHistorySchema = new Schema<ICreditUsageHistory>(
    {
        timestamp: { type: Date, required: true, default: Date.now },
        modelId: { type: String, required: true },
        modelName: { type: String },
        creditsUsed: { type: Number, required: true },
        requestType: {
            type: String,
            enum: ['text', 'image', 'video', 'audio', 'scraping'],
            required: true
        },
        usingByok: { type: Boolean, default: false },
    },
    { _id: false }
);

const CreditUsageSchema = new Schema<ICreditUsage>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        periodStart: {
            type: Date,
            required: true,
        },
        periodEnd: {
            type: Date,
            required: true,
        },
        creditsAllocated: {
            type: Number,
            required: true,
            default: 0,
        },
        creditsUsed: {
            type: Number,
            default: 0,
        },
        bonusCredits: {
            type: Number,
            default: 0,
        },
        bonusCreditsUsed: {
            type: Number,
            default: 0,
        },
        usageByType: {
            type: new Schema({
                text: { type: Number, default: 0 },
                image: { type: Number, default: 0 },
                video: { type: Number, default: 0 },
                audio: { type: Number, default: 0 },
                scraping: { type: Number, default: 0 },
            }, { _id: false }),
            default: () => ({ text: 0, image: 0, video: 0, audio: 0, scraping: 0 }),
        },
        usageHistory: {
            type: [CreditUsageHistorySchema],
            default: [],
        },
        lastRequestAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'credit_usage',
    }
);

// Compound index for efficient lookup
CreditUsageSchema.index({ userId: 1, periodStart: 1, periodEnd: 1 });

// Virtual for remaining credits
CreditUsageSchema.virtual('creditsRemaining').get(function () {
    const regularRemaining = Math.max(0, this.creditsAllocated - this.creditsUsed);
    const bonusRemaining = Math.max(0, this.bonusCredits - this.bonusCreditsUsed);
    return regularRemaining + bonusRemaining;
});

// Ensure virtuals are included in JSON
CreditUsageSchema.set('toJSON', { virtuals: true });
CreditUsageSchema.set('toObject', { virtuals: true });

// Prevent model recompilation in development
const CreditUsage: Model<ICreditUsage> =
    mongoose.models.CreditUsage || mongoose.model<ICreditUsage>('CreditUsage', CreditUsageSchema);

export default CreditUsage;
