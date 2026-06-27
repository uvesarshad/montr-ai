/**
 * Facebook Page post metrics fetcher.
 *
 * Uses the Facebook Graph API with a Page access token (not a user token).
 * `externalPostId` is the page-post id (typically `<pageId>_<postId>`).
 */

import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

interface FacebookPostResponse {
    id: string;
    permalink_url?: string;
    shares?: { count?: number };
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
}

interface FacebookInsightsResponse {
    data?: Array<{
        name: string;
        values: Array<{ value: number }>;
    }>;
}

export class FacebookFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'facebook';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
        if (!accountData?.accessToken) {
            throw new Error(`Facebook access token not found for account ${socialAccountId}`);
        }
        const { accessToken } = accountData;

        const postUrl = `${GRAPH_BASE}/${encodeURIComponent(externalPostId)}` +
            `?fields=id,permalink_url,shares,likes.summary(true),comments.summary(true)` +
            `&access_token=${encodeURIComponent(accessToken)}`;
        const postResp = await fetch(postUrl);
        if (!postResp.ok) {
            const error = await postResp.text();
            throw new Error(`Facebook post fetch failed: ${postResp.status} - ${error}`);
        }
        const post = (await postResp.json()) as FacebookPostResponse;

        const metrics = ['post_impressions', 'post_impressions_unique', 'post_clicks'];
        const insightsUrl = `${GRAPH_BASE}/${encodeURIComponent(externalPostId)}/insights` +
            `?metric=${metrics.join(',')}&access_token=${encodeURIComponent(accessToken)}`;
        const insightsResp = await fetch(insightsUrl);
        let impressions: number | undefined;
        let reach: number | undefined;
        let clicks: number | undefined;
        if (insightsResp.ok) {
            const insights = (await insightsResp.json()) as FacebookInsightsResponse;
            for (const item of insights.data ?? []) {
                const v = item.values?.[0]?.value ?? 0;
                if (item.name === 'post_impressions') impressions = v;
                if (item.name === 'post_impressions_unique') reach = v;
                if (item.name === 'post_clicks') clicks = v;
            }
        }

        return {
            externalPostId,
            postUrl: post.permalink_url,
            metrics: {
                likes: post.likes?.summary?.total_count ?? 0,
                comments: post.comments?.summary?.total_count ?? 0,
                shares: post.shares?.count ?? 0,
                impressions,
                reach,
                clicks,
            },
        };
    }
}

export const facebookFetcher = new FacebookFetcher();
