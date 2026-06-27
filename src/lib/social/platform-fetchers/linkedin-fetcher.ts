import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

export class LinkedInFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'linkedin';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

        if (!accountData || !accountData.accessToken) {
            throw new Error(`LinkedIn access token not found for account ${socialAccountId}`);
        }

        const { accessToken } = accountData;

        try {
            // LinkedIn Social Metadata API: GET /v2/socialMetadata/{target}
            // externalPostId is expected to be a URN like urn:li:share:123 or urn:li:ugcPost:123
            const url = `https://api.linkedin.com/v2/socialMetadata/${encodeURIComponent(externalPostId)}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`LinkedIn API error: ${response.status} - ${JSON.stringify(error)}`);
            }

            const data = await response.json();

            // Extract metrics from socialMetadata response
            const metrics = {
                likes: data.totalShareStatistics?.likeCount || 0,
                comments: data.totalShareStatistics?.commentCount || 0,
                shares: data.totalShareStatistics?.shareCount || 0,
                impressions: data.totalShareStatistics?.impressionCount || 0, // Note: Impressions might require specific scopes
            };

            return {
                externalPostId,
                metrics,
            };
        } catch (error: unknown) {
            console.error(`Failed to fetch LinkedIn metrics for post ${externalPostId}:`, error);
            throw error;
        }
    }
}

export const linkedinFetcher = new LinkedInFetcher();
