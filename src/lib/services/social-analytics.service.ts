import { analyticsRepository } from '@/lib/db/repository/analytics.repository';
import { platformFetchers } from '@/lib/social/platform-fetchers';
import { connectDB } from '@/lib/mongodb';
import PostAnalytics from '@/lib/db/models/analytics.model';

export class SocialAnalyticsService {
    /**
     * Sync metrics for a specific post
     */
    async syncPostMetrics(analyticsId: string): Promise<boolean> {
        await connectDB();
        const record = await analyticsRepository.findById(analyticsId);

        if (!record || !record.platform || !record.externalPostId) {
            console.warn(`[AnalyticsService] Invalid record for sync: ${analyticsId}`);
            return false;
        }

        const fetcher = platformFetchers[record.platform];
        if (!fetcher) {
            // Not supported yet
            return false;
        }

        try {
            const result = await fetcher.fetchPostMetrics(record.platformAccountId, record.externalPostId);

            await analyticsRepository.updateMetrics(analyticsId, {
                metrics: result.metrics,
                saveHistory: true, // Always save history during sync for trend analysis
            });

            return true;
        } catch (error) {
            console.error(`[AnalyticsService] Sync failed for post ${analyticsId} (${record.platform}):`, error);
            return false;
        }
    }

    /**
     * Batch sync for all active posts (e.g. published in last 30 days)
     */
    async syncAllActivePosts(daysLimit: number = 30): Promise<{ processed: number; successful: number }> {
        await connectDB();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

        // Find all records that need sync
        // We sync if it's within the cutoff and hasn't been synced in the last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const postsToSync = await PostAnalytics.find({
            publishedAt: { $gte: cutoffDate },
            lastFetchedAt: { $lte: oneHourAgo },
            platform: { $in: Object.keys(platformFetchers) }
        }).limit(100); // Limit per run to avoid timeouts

        let successful = 0;
        for (const post of postsToSync) {
            const result = await this.syncPostMetrics(post._id.toString());
            if (result) successful++;

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return {
            processed: postsToSync.length,
            successful
        };
    }
}

export const socialAnalyticsService = new SocialAnalyticsService();
