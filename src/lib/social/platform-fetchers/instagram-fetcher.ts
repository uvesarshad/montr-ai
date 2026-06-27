/**
 * Instagram metrics fetcher.
 *
 * Uses the Instagram Graph API (Business / Creator account, connected via
 * Meta OAuth). The metrics endpoint differs by media type:
 *   - IMAGE / CAROUSEL: impressions, reach, engagement, saved
 *   - VIDEO / REEL:     video_views, plays, reach, impressions, saved, comments
 *
 * `externalPostId` is the Instagram media id (IGTV / reel / photo).
 */

import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

interface InstagramMediaResponse {
    id: string;
    media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
    permalink?: string;
    like_count?: number;
    comments_count?: number;
}

interface InstagramInsightsResponse {
    data?: Array<{
        name: string;
        period: string;
        values: Array<{ value: number }>;
    }>;
}

export class InstagramFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'instagram';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
        if (!accountData?.accessToken) {
            throw new Error(`Instagram access token not found for account ${socialAccountId}`);
        }
        const { accessToken } = accountData;

        // 1. Fetch the media itself for like_count + comments_count (sync, basic).
        const mediaUrl = `${GRAPH_BASE}/${encodeURIComponent(externalPostId)}` +
            `?fields=id,media_type,permalink,like_count,comments_count&access_token=${encodeURIComponent(accessToken)}`;
        const mediaResp = await fetch(mediaUrl);
        if (!mediaResp.ok) {
            const error = await mediaResp.text();
            throw new Error(`Instagram media fetch failed: ${mediaResp.status} - ${error}`);
        }
        const media = (await mediaResp.json()) as InstagramMediaResponse;

        // 2. Pick metric names based on media type — they're not uniform across types.
        const isVideo = media.media_type === 'VIDEO' || media.media_type === 'REELS';
        const metricNames = isVideo
            ? ['video_views', 'reach', 'impressions', 'saved']
            : ['impressions', 'reach', 'saved'];

        const insightsUrl = `${GRAPH_BASE}/${encodeURIComponent(externalPostId)}/insights` +
            `?metric=${metricNames.join(',')}&access_token=${encodeURIComponent(accessToken)}`;
        const insightsResp = await fetch(insightsUrl);
        let videoViews: number | undefined;
        let impressions: number | undefined;
        let reach: number | undefined;
        let saves: number | undefined;
        if (insightsResp.ok) {
            const insights = (await insightsResp.json()) as InstagramInsightsResponse;
            for (const item of insights.data ?? []) {
                const v = item.values?.[0]?.value ?? 0;
                if (item.name === 'video_views') videoViews = v;
                if (item.name === 'impressions') impressions = v;
                if (item.name === 'reach') reach = v;
                if (item.name === 'saved') saves = v;
            }
        }

        return {
            externalPostId,
            postUrl: media.permalink,
            metrics: {
                likes: media.like_count ?? 0,
                comments: media.comments_count ?? 0,
                shares: 0, // Instagram does not expose post-level shares
                impressions,
                reach,
                saves,
                videoViews,
                engagementRate:
                    reach && reach > 0
                        ? ((media.like_count ?? 0) + (media.comments_count ?? 0) + (saves ?? 0)) / reach
                        : undefined,
            },
        };
    }
}

export const instagramFetcher = new InstagramFetcher();
