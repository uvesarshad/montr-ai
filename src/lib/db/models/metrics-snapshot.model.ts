import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Daily-grain time-series metrics for every connected analytics source.
 *
 * One document = one entity × one day. "Entities" cover both real objects
 * (ad campaigns, pages, channels) and dimensional breakdown rows (a Search
 * Console query, a GA4 channel group) — breakdowns are just entities with
 * a parentEntityId, which keeps the unique key simple.
 *
 * Post-level metrics stay in PostAnalytics (analytics.model.ts); this
 * collection is account/campaign/property level.
 */
export type MetricsSourceType =
    | 'meta_ads'
    | 'google_ads'
    | 'ga4'
    | 'search_console'
    | 'youtube'
    | 'facebook'
    | 'instagram'
    | 'threads'
    | 'linkedin'
    | 'tiktok'
    | 'x';

export type MetricsEntityType =
    | 'account'        // ad account / social account top level
    | 'campaign'
    | 'adset'          // Meta ad set / Google ad group
    | 'ad'
    | 'page'           // Facebook page
    | 'channel'        // YouTube channel
    | 'property'       // GA4 property
    | 'site'           // Search Console site
    | 'query'          // Search Console query breakdown (parent: site)
    | 'page_path'      // GSC page / GA4 landing-page breakdown (parent: site/property)
    | 'channel_group'; // GA4 default channel group breakdown (parent: property)

export interface IMetricsSnapshot extends Document {
    brandId: string;

    sourceType: MetricsSourceType;
    /** _id of the owning connection (AdAccount / AnalyticsSource / SocialAccount) */
    sourceId: string;

    entityType: MetricsEntityType;
    /** Platform-native ID of the entity (campaign ID, page ID, query text, ...) */
    entityId: string;
    entityName?: string;     // Denormalized for display
    parentEntityId?: string; // e.g. adset → campaign, query → siteUrl

    /** Day bucket, 'YYYY-MM-DD' in the source account's reporting timezone */
    date: string;

    /** Flat metric map, e.g. { spend: 12.5, impressions: 4400, clicks: 71 } */
    metrics: Record<string, number>;

    createdAt: Date;
    updatedAt: Date;
}

const MetricsSnapshotSchema = new Schema<IMetricsSnapshot>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        sourceType: {
            type: String,
            enum: [
                'meta_ads', 'google_ads', 'ga4', 'search_console', 'youtube',
                'facebook', 'instagram', 'threads', 'linkedin', 'tiktok', 'x',
            ],
            required: true,
        },
        sourceId: {
            type: String,
            required: true,
        },
        entityType: {
            type: String,
            enum: [
                'account', 'campaign', 'adset', 'ad', 'page', 'channel',
                'property', 'site', 'query', 'page_path', 'channel_group',
            ],
            required: true,
        },
        entityId: {
            type: String,
            required: true,
        },
        entityName: {
            type: String,
            default: null,
        },
        parentEntityId: {
            type: String,
            default: null,
        },
        date: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/,
        },
        metrics: {
            type: Schema.Types.Mixed,
            required: true,
            default: {},
        },
    },
    {
        timestamps: true,
        collection: 'metrics_snapshots',
    }
);

// One row per entity per day — sync runs upsert against this key
MetricsSnapshotSchema.index({ sourceId: 1, entityType: 1, entityId: 1, date: 1 }, { unique: true });
// Query patterns: org/brand dashboards over a date range, per source type
MetricsSnapshotSchema.index({ sourceType: 1, date: 1 });
MetricsSnapshotSchema.index({ brandId: 1, sourceType: 1, date: 1 });
MetricsSnapshotSchema.index({ sourceId: 1, date: 1 });

// Prevent model recompilation in development
const MetricsSnapshot: Model<IMetricsSnapshot> =
    mongoose.models.MetricsSnapshot || mongoose.model<IMetricsSnapshot>('MetricsSnapshot', MetricsSnapshotSchema);

export default MetricsSnapshot;
