import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Read-only analytics data sources (distinct from ad accounts):
 * - ga4: a Google Analytics 4 property
 * - search_console: a Google Search Console site
 */
export type AnalyticsSourceType = 'ga4' | 'search_console';

export interface IAnalyticsSource extends Document {
    brandId: string;
    userId: string;              // User who connected the source

    sourceType: AnalyticsSourceType;
    externalId: string;          // GA4: numeric property ID · GSC: siteUrl (e.g. "sc-domain:example.com")
    displayName: string;

    // Encrypted credentials (AES-256-GCM) — Google OAuth tokens
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt?: Date;

    // Metadata
    scopes: string[];
    isActive: boolean;
    lastSyncedAt?: Date;
    lastUsedAt?: Date;
    lastError?: string;

    metadata?: {
        accountName?: string;     // GA4: parent Analytics account name
        permissionLevel?: string; // GSC: siteOwner / siteFullUser / ...
    };

    createdAt: Date;
    updatedAt: Date;
}

const AnalyticsSourceSchema = new Schema<IAnalyticsSource>(
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
        sourceType: {
            type: String,
            enum: ['ga4', 'search_console'],
            required: true,
        },
        externalId: {
            type: String,
            required: true,
        },
        displayName: {
            type: String,
            required: true,
        },
        encryptedAccessToken: {
            type: String,
            required: true,
            select: false, // Don't include in queries by default for security
        },
        encryptedRefreshToken: {
            type: String,
            default: null,
            select: false,
        },
        tokenExpiresAt: {
            type: Date,
            default: null,
        },
        scopes: {
            type: [String],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastSyncedAt: {
            type: Date,
            default: null,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        lastError: {
            type: String,
            default: null,
        },
        metadata: {
            accountName: String,
            permissionLevel: String,
        },
    },
    {
        timestamps: true,
        collection: 'analytics_sources',
    }
);

// Indexes
AnalyticsSourceSchema.index({ sourceType: 1 });
AnalyticsSourceSchema.index({ brandId: 1, sourceType: 1 });
AnalyticsSourceSchema.index({ sourceType: 1, externalId: 1 }, { unique: true }); // Prevent duplicate connections

// Prevent model recompilation in development
const AnalyticsSource: Model<IAnalyticsSource> =
    mongoose.models.AnalyticsSource || mongoose.model<IAnalyticsSource>('AnalyticsSource', AnalyticsSourceSchema);

export default AnalyticsSource;
