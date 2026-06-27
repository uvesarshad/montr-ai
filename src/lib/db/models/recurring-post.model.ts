import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRecurringPost extends Document {
    brandId: string;
    userId: string;
    title: string;
    content: string;
    media: {
        url: string;
        type: 'image' | 'video';
        altText?: string;
    }[];
    platforms: string[];          // Account IDs to post to
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    dayOfWeek?: number;           // 0-6 (Sunday-Saturday) for weekly
    dayOfMonth?: number;          // 1-31 for monthly
    timeOfDay: string;            // HH:mm format
    timezone: string;
    nextRunAt: Date;
    lastRunAt?: Date;
    totalRuns: number;
    maxRuns?: number;             // Stop after X runs (null = forever)
    status: 'active' | 'paused' | 'completed';
    createdAt: Date;
    updatedAt: Date;
}

const RecurringPostSchema = new Schema<IRecurringPost>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        content: {
            type: String,
            required: true,
        },
        media: [{
            url: { type: String, required: true },
            type: { type: String, enum: ['image', 'video'], required: true },
            altText: { type: String },
        }],
        platforms: {
            type: [String],
            required: true,
        },
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'biweekly', 'monthly'],
            required: true,
        },
        dayOfWeek: {
            type: Number,
            min: 0,
            max: 6,
        },
        dayOfMonth: {
            type: Number,
            min: 1,
            max: 31,
        },
        timeOfDay: {
            type: String,
            required: true,
        },
        timezone: {
            type: String,
            default: 'UTC',
        },
        nextRunAt: {
            type: Date,
            required: true,
            index: true,
        },
        lastRunAt: {
            type: Date,
        },
        totalRuns: {
            type: Number,
            default: 0,
        },
        maxRuns: {
            type: Number,
            default: null,
        },
        status: {
            type: String,
            enum: ['active', 'paused', 'completed'],
            default: 'active',
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'recurring_posts',
    }
);

// Indexes
RecurringPostSchema.index({ brandId: 1, status: 1 });
RecurringPostSchema.index({ nextRunAt: 1, status: 1 });

const RecurringPost: Model<IRecurringPost> =
    mongoose.models.RecurringPost || mongoose.model<IRecurringPost>('RecurringPost', RecurringPostSchema);

export default RecurringPost;
