import { connectDB } from '@/lib/mongodb';
import {
    PostAnalytics,
    IPostAnalytics,
    IPlatformMetrics,
    MetricPlatform
} from '../models/analytics.model';

export interface CreatePostAnalyticsInput {
    scheduledPostId?: string;
    externalPostId?: string;
    brandId: string;
    userId: string;
    platform: MetricPlatform;
    platformAccountId: string;
    postUrl?: string;
    publishedAt: Date;
    contentPreview: string;
    hasMedia: boolean;
    metrics?: Partial<IPlatformMetrics>;
}

export interface UpdateMetricsInput {
    metrics: Partial<IPlatformMetrics>;
    saveHistory?: boolean;
}

export interface AnalyticsFilters {
    brandId?: string;
    userId?: string;
    platform?: MetricPlatform | MetricPlatform[];
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
}

export interface AnalyticsSummary {
    totalPosts: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalReach: number;
    totalImpressions: number;
    avgEngagementRate: number;
    platformBreakdown: {
        platform: MetricPlatform;
        count: number;
        engagement: number;
    }[];
    topPosts: IPostAnalytics[];
    recentPosts: IPostAnalytics[];
}

class AnalyticsRepository {
    /**
     * Create a new post analytics record
     */
    async createPostAnalytics(input: CreatePostAnalyticsInput): Promise<IPostAnalytics> {
        await connectDB();

        const analytics = new PostAnalytics({
            ...input,
            contentPreview: input.contentPreview.slice(0, 200),
            metrics: input.metrics || {},
            lastFetchedAt: new Date(),
            fetchCount: 1,
        });

        return analytics.save();
    }

    /**
     * Find or create analytics for a post
     */
    async findOrCreateByExternalId(
        platform: MetricPlatform,
        externalPostId: string,
        createData: CreatePostAnalyticsInput
    ): Promise<IPostAnalytics> {
        await connectDB();

        const existing = await PostAnalytics.findOne({ platform, externalPostId });
        if (existing) {
            return existing;
        }

        return this.createPostAnalytics({ ...createData, externalPostId });
    }

    /**
     * Find analytics by post ID
     */
    async findById(id: string): Promise<IPostAnalytics | null> {
        await connectDB();
        return PostAnalytics.findById(id).exec();
    }

    /**
     * Find analytics by scheduled post ID
     */
    async findByScheduledPostId(scheduledPostId: string): Promise<IPostAnalytics[]> {
        await connectDB();
        return PostAnalytics.find({ scheduledPostId }).sort({ publishedAt: -1 }).exec();
    }

    /**
     * Update metrics for a post
     */
    async updateMetrics(
        id: string,
        input: UpdateMetricsInput
    ): Promise<IPostAnalytics | null> {
        await connectDB();

        const post = await PostAnalytics.findById(id);
        if (!post) return null;

        // Update current metrics
        const updatedMetrics = { ...post.metrics, ...input.metrics };

        const update: Record<string, unknown> = {
            $set: {
                metrics: updatedMetrics,
                lastFetchedAt: new Date(),
            },
            $inc: { fetchCount: 1 },
        };

        // Optionally save historical snapshot
        if (input.saveHistory) {
            update.$push = {
                historicalMetrics: {
                    timestamp: new Date(),
                    metrics: updatedMetrics,
                },
            };
        }

        return PostAnalytics.findByIdAndUpdate(id, update, { new: true }).exec();
    }

    /**
     * Get analytics for a brand with filtering
     */
    async getByBrand(brandId: string, filters?: Partial<AnalyticsFilters>): Promise<IPostAnalytics[]> {
        await connectDB();

        const query: Record<string, unknown> = { brandId };

        if (filters?.platform) {
            query.platform = Array.isArray(filters.platform)
                ? { $in: filters.platform }
                : filters.platform;
        }

        if (filters?.fromDate || filters?.toDate) {
            query.publishedAt = {};
            if (filters.fromDate) {
                (query.publishedAt as Record<string, Date>).$gte = filters.fromDate;
            }
            if (filters.toDate) {
                (query.publishedAt as Record<string, Date>).$lte = filters.toDate;
            }
        }

        return PostAnalytics.find(query)
            .sort({ publishedAt: -1 })
            .limit(filters?.limit || 100)
            .exec();
    }

    /**
     * Get aggregated summary for a brand
     */
    async getSummary(brandId: string, fromDate: Date, toDate: Date): Promise<AnalyticsSummary> {
        await connectDB();

        const posts = await PostAnalytics.find({
            brandId,
            publishedAt: { $gte: fromDate, $lte: toDate },
        }).exec();

        const platformBreakdown: Map<MetricPlatform, { count: number; engagement: number }> = new Map();
        let totalLikes = 0;
        let totalComments = 0;
        let totalShares = 0;
        let totalReach = 0;
        let totalImpressions = 0;
        let totalEngagementRate = 0;

        for (const post of posts) {
            // Platform breakdown
            const platformData = platformBreakdown.get(post.platform) || { count: 0, engagement: 0 };
            platformData.count += 1;
            platformData.engagement += (post.metrics.likes || 0) + (post.metrics.comments || 0) + (post.metrics.shares || 0);
            platformBreakdown.set(post.platform, platformData);

            // Totals
            totalLikes += post.metrics.likes || 0;
            totalComments += post.metrics.comments || 0;
            totalShares += post.metrics.shares || 0;
            totalReach += post.metrics.reach || 0;
            totalImpressions += post.metrics.impressions || 0;
            totalEngagementRate += post.metrics.engagementRate || 0;
        }

        // Sort by engagement to get top posts
        const sortedPosts = [...posts].sort((a, b) => {
            const engA = (a.metrics.likes || 0) + (a.metrics.comments || 0) + (a.metrics.shares || 0);
            const engB = (b.metrics.likes || 0) + (b.metrics.comments || 0) + (b.metrics.shares || 0);
            return engB - engA;
        });

        return {
            totalPosts: posts.length,
            totalLikes,
            totalComments,
            totalShares,
            totalReach,
            totalImpressions,
            avgEngagementRate: posts.length > 0 ? totalEngagementRate / posts.length : 0,
            platformBreakdown: Array.from(platformBreakdown.entries()).map(([platform, data]) => ({
                platform,
                ...data,
            })),
            topPosts: sortedPosts.slice(0, 5),
            recentPosts: posts.slice(0, 5),
        };
    }

    /**
     * Get performance trends over time
     */
    async getTrends(
        brandId: string,
        fromDate: Date,
        toDate: Date,
        groupBy: 'day' | 'week' | 'month' = 'day'
    ): Promise<{ date: string; posts: number; engagement: number; reach: number }[]> {
        await connectDB();

        const dateFormat = {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$publishedAt' } },
            week: { $dateToString: { format: '%Y-W%V', date: '$publishedAt' } },
            month: { $dateToString: { format: '%Y-%m', date: '$publishedAt' } },
        };

        const result = await PostAnalytics.aggregate([
            {
                $match: {
                    brandId,
                    publishedAt: { $gte: fromDate, $lte: toDate },
                },
            },
            {
                $group: {
                    _id: dateFormat[groupBy],
                    posts: { $sum: 1 },
                    engagement: {
                        $sum: {
                            $add: [
                                { $ifNull: ['$metrics.likes', 0] },
                                { $ifNull: ['$metrics.comments', 0] },
                                { $ifNull: ['$metrics.shares', 0] },
                            ],
                        },
                    },
                    reach: { $sum: { $ifNull: ['$metrics.reach', 0] } },
                },
            },
            { $sort: { _id: 1 } },
        ]).exec();

        return result.map((r) => ({
            date: r._id,
            posts: r.posts,
            engagement: r.engagement,
            reach: r.reach,
        }));
    }

    /**
     * Get platform comparison
     */
    async getPlatformComparison(brandId: string, fromDate: Date, toDate: Date): Promise<{
        platform: MetricPlatform;
        posts: number;
        avgLikes: number;
        avgComments: number;
        avgShares: number;
        avgEngagementRate: number;
    }[]> {
        await connectDB();

        const result = await PostAnalytics.aggregate([
            {
                $match: {
                    brandId,
                    publishedAt: { $gte: fromDate, $lte: toDate },
                },
            },
            {
                $group: {
                    _id: '$platform',
                    posts: { $sum: 1 },
                    avgLikes: { $avg: { $ifNull: ['$metrics.likes', 0] } },
                    avgComments: { $avg: { $ifNull: ['$metrics.comments', 0] } },
                    avgShares: { $avg: { $ifNull: ['$metrics.shares', 0] } },
                    avgEngagementRate: { $avg: { $ifNull: ['$metrics.engagementRate', 0] } },
                },
            },
            { $sort: { posts: -1 } },
        ]).exec();

        return result.map((r) => ({
            platform: r._id as MetricPlatform,
            posts: r.posts,
            avgLikes: Math.round(r.avgLikes * 100) / 100,
            avgComments: Math.round(r.avgComments * 100) / 100,
            avgShares: Math.round(r.avgShares * 100) / 100,
            avgEngagementRate: Math.round(r.avgEngagementRate * 100) / 100,
        }));
    }

    /**
     * Delete analytics for a post
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await PostAnalytics.findByIdAndDelete(id).exec();
        return !!result;
    }

    /**
     * Bulk import analytics (for syncing from platform APIs)
     */
    async bulkUpsert(
        data: CreatePostAnalyticsInput[]
    ): Promise<{ inserted: number; updated: number }> {
        await connectDB();

        let inserted = 0;
        let updated = 0;

        for (const item of data) {
            if (item.externalPostId) {
                const existing = await PostAnalytics.findOne({
                    platform: item.platform,
                    externalPostId: item.externalPostId,
                });

                if (existing) {
                    await PostAnalytics.findByIdAndUpdate(existing._id, {
                        $set: {
                            metrics: item.metrics || {},
                            lastFetchedAt: new Date(),
                        },
                        $inc: { fetchCount: 1 },
                    });
                    updated++;
                } else {
                    await this.createPostAnalytics(item);
                    inserted++;
                }
            } else {
                await this.createPostAnalytics(item);
                inserted++;
            }
        }

        return { inserted, updated };
    }
}

export const analyticsRepository = new AnalyticsRepository();
