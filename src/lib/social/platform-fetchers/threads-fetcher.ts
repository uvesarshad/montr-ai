/**
 * Threads post metrics fetcher.
 *
 * Uses the Threads Graph API (Meta), which is distinct from the Facebook Graph
 * API and is rooted at `https://graph.threads.net`:
 *   - Media insights: `GET /v1.0/{media-id}/insights?metric=views,likes,replies,reposts,quotes`
 *   - Media object:   `GET /v1.0/{media-id}?fields=id,permalink` for the post URL
 *
 * `externalPostId` is the Threads media id. The account is connected via Meta
 * OAuth and the decrypted access token is read off the social account.
 */

import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

const THREADS_BASE = 'https://graph.threads.net/v1.0';

interface ThreadsMediaResponse {
    id: string;
    permalink?: string;
}

interface ThreadsInsightItem {
    name: string;
    period?: string;
    values?: Array<{ value: number }>;
    // Some metrics (e.g. lifetime totals) come back on `total_value`.
    total_value?: { value: number };
}

interface ThreadsInsightsResponse {
    data?: ThreadsInsightItem[];
}

function insightValue(item: ThreadsInsightItem): number {
    return item.total_value?.value ?? item.values?.[0]?.value ?? 0;
}

export class ThreadsFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'threads';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
        if (!accountData?.accessToken) {
            throw new Error(`Threads access token not found for account ${socialAccountId}`);
        }
        const { accessToken } = accountData;

        // 1. Fetch the media object for the permalink (best-effort).
        const mediaUrl = `${THREADS_BASE}/${encodeURIComponent(externalPostId)}` +
            `?fields=id,permalink&access_token=${encodeURIComponent(accessToken)}`;
        let permalink: string | undefined;
        const mediaResp = await fetch(mediaUrl);
        if (mediaResp.ok) {
            const media = (await mediaResp.json()) as ThreadsMediaResponse;
            permalink = media.permalink;
        }

        // 2. Fetch post insights.
        const metricNames = ['views', 'likes', 'replies', 'reposts', 'quotes'];
        const insightsUrl = `${THREADS_BASE}/${encodeURIComponent(externalPostId)}/insights` +
            `?metric=${metricNames.join(',')}&access_token=${encodeURIComponent(accessToken)}`;
        const insightsResp = await fetch(insightsUrl);
        if (!insightsResp.ok) {
            const error = await insightsResp.text();
            throw new Error(`Threads insights fetch failed: ${insightsResp.status} - ${error}`);
        }
        const insights = (await insightsResp.json()) as ThreadsInsightsResponse;

        let views: number | undefined;
        let likes = 0;
        let replies = 0;
        let reposts = 0;
        let quotes = 0;
        for (const item of insights.data ?? []) {
            const v = insightValue(item);
            if (item.name === 'views') views = v;
            if (item.name === 'likes') likes = v;
            if (item.name === 'replies') replies = v;
            if (item.name === 'reposts') reposts = v;
            if (item.name === 'quotes') quotes = v;
        }

        // Threads has no first-class "comments" — replies are the closest analog;
        // reposts + quotes are the share-like surfaces.
        const comments = replies;
        const shares = reposts + quotes;

        return {
            externalPostId,
            postUrl: permalink,
            metrics: {
                likes,
                comments,
                shares,
                impressions: views,
                engagementRate:
                    views && views > 0 ? (likes + comments + shares) / views : undefined,
            },
        };
    }
}

export const threadsFetcher = new ThreadsFetcher();
