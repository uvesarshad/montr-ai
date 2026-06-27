import mongoose, { Schema, Document, Model } from 'mongoose';

export type MetricPlatform =
    | 'x'
    | 'linkedin'
    | 'facebook'
    | 'instagram'
    | 'youtube'
    | 'pinterest'
    | 'tiktok'
    | 'telegram'
    | 'reddit'
    | 'dribbble'
    | 'threads'
    | 'google_business';

export interface IPlatformMetrics {
    likes: number;
    comments: number;
    shares: number;
    saves?: number;
    reach?: number;
    impressions?: number;
    engagementRate?: number;
    clicks?: number;
    videoViews?: number;
    profileVisits?: number;
    followers?: number;
}

export interface IPostAnalytics extends Document {
    // Reference to the post
    scheduledPostId?: string;          // If from scheduled post
    externalPostId?: string;           // Platform's post ID

    // Post metadata
    brandId: string;
    userId: string;
    platform: MetricPlatform;
    platformAccountId: string;
    postUrl?: string;
    publishedAt: Date;

    // Content snapshot
    contentPreview: string;            // First 200 chars of content
    hasMedia: boolean;

    // Metrics (current snapshot)
    metrics: IPlatformMetrics;

    // Historical snapshots for trend analysis
    historicalMetrics: {
        timestamp: Date;
        metrics: IPlatformMetrics;
    }[];

    // Metadata
    lastFetchedAt: Date;
    fetchCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface IBrandAnalyticsSummary extends Document {
    brandId: string;
    period: 'daily' | 'weekly' | 'monthly';
    periodStart: Date;
    periodEnd: Date;

    // Aggregated metrics per platform
    platformMetrics: {
        platform: MetricPlatform;
        totalPosts: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalReach: number;
        totalImpressions: number;
        avgEngagementRate: number;
    }[];

    // Overall summary
    totalPosts: number;
    totalEngagement: number;
    avgEngagementRate: number;
    topPerformingPlatform?: MetricPlatform;

    createdAt: Date;
    updatedAt: Date;
}

const PlatformMetricsSchema = new Schema<IPlatformMetrics>(
    {
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
        saves: { type: Number, default: 0 },
        reach: { type: Number, default: 0 },
        impressions: { type: Number, default: 0 },
        engagementRate: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        videoViews: { type: Number, default: 0 },
        profileVisits: { type: Number, default: 0 },
        followers: { type: Number, default: 0 },
    },
    { _id: false }
);

const HistoricalMetricsSchema = new Schema(
    {
        timestamp: { type: Date, required: true },
        metrics: { type: PlatformMetricsSchema, required: true },
    },
    { _id: false }
);

const PostAnalyticsSchema = new Schema<IPostAnalytics>(
    {
        scheduledPostId: {
            type: String,
            default: null,
            index: true,
        },
        externalPostId: {
            type: String,
            default: null,
        },
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        platform: {
            type: String,
            enum: ['x', 'linkedin', 'facebook', 'instagram', 'youtube', 'telegram', 'reddit', 'dribbble', 'threads', 'google_business'],
            required: true,
        },
        platformAccountId: {
            type: String,
            required: true,
        },
        postUrl: {
            type: String,
            default: null,
        },
        publishedAt: {
            type: Date,
            required: true,
            index: true,
        },
        contentPreview: {
            type: String,
            required: true,
            maxlength: 200,
        },
        hasMedia: {
            type: Boolean,
            default: false,
        },
        metrics: {
            type: PlatformMetricsSchema,
            default: () => ({}),
        },
        historicalMetrics: {
            type: [HistoricalMetricsSchema],
            default: [],
        },
        lastFetchedAt: {
            type: Date,
            default: Date.now,
        },
        fetchCount: {
            type: Number,
            default: 1,
        },
    },
    {
        timestamps: true,
        collection: 'post_analytics',
    }
);

// Indexes for efficient querying
PostAnalyticsSchema.index({ brandId: 1, publishedAt: -1 });
PostAnalyticsSchema.index({ brandId: 1, platform: 1 });
PostAnalyticsSchema.index({ platform: 1, externalPostId: 1 }, { unique: true, sparse: true });

const PlatformMetricsSummarySchema = new Schema(
    {
        platform: { type: String, required: true },
        totalPosts: { type: Number, default: 0 },
        totalLikes: { type: Number, default: 0 },
        totalComments: { type: Number, default: 0 },
        totalShares: { type: Number, default: 0 },
        totalReach: { type: Number, default: 0 },
        totalImpressions: { type: Number, default: 0 },
        avgEngagementRate: { type: Number, default: 0 },
    },
    { _id: false }
);

const BrandAnalyticsSummarySchema = new Schema<IBrandAnalyticsSummary>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        period: {
            type: String,
            enum: ['daily', 'weekly', 'monthly'],
            required: true,
        },
        periodStart: {
            type: Date,
            required: true,
        },
        periodEnd: {
            type: Date,
            required: true,
        },
        platformMetrics: {
            type: [PlatformMetricsSummarySchema],
            default: [],
        },
        totalPosts: {
            type: Number,
            default: 0,
        },
        totalEngagement: {
            type: Number,
            default: 0,
        },
        avgEngagementRate: {
            type: Number,
            default: 0,
        },
        topPerformingPlatform: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'brand_analytics_summaries',
    }
);

// Indexes
BrandAnalyticsSummarySchema.index({ brandId: 1, period: 1, periodStart: -1 });

// Prevent model recompilation in development
const PostAnalytics: Model<IPostAnalytics> =
    mongoose.models.PostAnalytics ||
    mongoose.model<IPostAnalytics>('PostAnalytics', PostAnalyticsSchema);

const BrandAnalyticsSummary: Model<IBrandAnalyticsSummary> =
    mongoose.models.BrandAnalyticsSummary ||
    mongoose.model<IBrandAnalyticsSummary>('BrandAnalyticsSummary', BrandAnalyticsSummarySchema);

export { PostAnalytics, BrandAnalyticsSummary };
export default PostAnalytics;
