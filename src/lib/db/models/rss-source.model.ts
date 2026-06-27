import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRssSource extends Document {
    brandId: string;
    userId: string;
    name: string;
    feedUrl: string;
    enabled: boolean;
    targetAccountIds: string[];
    targetPlatforms: string[];
    lastSeenUrl?: string;              // Dedupe
    lastSeenGuid?: string;
    lastFetchedAt?: Date;
    lastError?: string;
    generateImage: boolean;
    autoApprove: boolean;             // When false, generated posts go through approval
    cadenceMinutes: number;

    createdAt: Date;
    updatedAt: Date;
}

const RssSourceSchema = new Schema<IRssSource>(
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
        name: {
            type: String,
            required: true,
            trim: true,
        },
        feedUrl: {
            type: String,
            required: true,
            trim: true,
        },
        enabled: {
            type: Boolean,
            default: true,
            index: true,
        },
        targetAccountIds: {
            type: [String],
            default: [],
        },
        targetPlatforms: {
            type: [String],
            default: [],
        },
        lastSeenUrl: {
            type: String,
            default: null,
        },
        lastSeenGuid: {
            type: String,
            default: null,
        },
        lastFetchedAt: {
            type: Date,
            default: null,
        },
        lastError: {
            type: String,
            default: null,
        },
        generateImage: {
            type: Boolean,
            default: false,
        },
        autoApprove: {
            type: Boolean,
            default: false,
        },
        cadenceMinutes: {
            type: Number,
            default: 60,
            min: 1,
        },
    },
    {
        timestamps: true,
        collection: 'rss_sources',
    }
);

// Indexes
RssSourceSchema.index({ brandId: 1 });
RssSourceSchema.index({ enabled: 1, lastFetchedAt: 1 }); // For finding due sources

const RssSource: Model<IRssSource> =
    mongoose.models.RssSource ||
    mongoose.model<IRssSource>('RssSource', RssSourceSchema);

export default RssSource;
