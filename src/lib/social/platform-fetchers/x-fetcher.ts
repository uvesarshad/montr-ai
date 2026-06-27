import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

export class XFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'x';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

        if (!accountData || !accountData.accessToken) {
            throw new Error(`X access token not found for account ${socialAccountId}`);
        }

        const { accessToken } = accountData;

        try {
            // X API v2: GET /2/tweets/:id
            const url = `https://api.twitter.com/2/tweets/${externalPostId}?tweet.fields=public_metrics`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': 'Montr-AI-Studio/1.0',
                },
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`X API error: ${response.status} - ${JSON.stringify(error)}`);
            }

            const data = await response.json();
            const metrics = data.data?.public_metrics;

            if (!metrics) {
                throw new Error('No metrics found in X API response');
            }

            return {
                externalPostId,
                metrics: {
                    likes: metrics.like_count || 0,
                    comments: metrics.reply_count || 0,
                    shares: metrics.retweet_count || 0,
                    impressions: metrics.impression_count || 0,
                    // X also provides quote_count and bookmark_count, but we stick to standard ones
                },
            };
        } catch (error: unknown) {
            console.error(`Failed to fetch X metrics for post ${externalPostId}:`, error);
            throw error;
        }
    }
}

export const xFetcher = new XFetcher();
