/**
 * YouTube video metrics fetcher.
 *
 * Uses the YouTube Data API v3:
 *   - `videos?part=statistics,snippet,player&id={id}` returns views, likes,
 *     comments, snippet for the video.
 *   - Channel-level subscribers come from `channels?part=statistics&mine=true`
 *     when needed.
 *
 * `externalPostId` is the YouTube video id (11-char base64).
 */

import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

interface YouTubeVideosResponse {
    items?: Array<{
        id: string;
        statistics?: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
            favoriteCount?: string;
        };
        snippet?: {
            title?: string;
            channelId?: string;
            thumbnails?: Record<string, { url?: string }>;
        };
        player?: { embedHtml?: string };
    }>;
}

interface YouTubeChannelsResponse {
    items?: Array<{
        id: string;
        statistics?: {
            subscriberCount?: string;
        };
    }>;
}

function toNumber(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

export class YouTubeFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'youtube';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
        if (!accountData?.accessToken) {
            throw new Error(`YouTube access token not found for account ${socialAccountId}`);
        }
        const { accessToken } = accountData;

        const videosUrl = `${YT_BASE}/videos?part=statistics,snippet&id=${encodeURIComponent(externalPostId)}`;
        const videosResp = await fetch(videosUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!videosResp.ok) {
            const error = await videosResp.text();
            throw new Error(`YouTube videos.list failed: ${videosResp.status} - ${error}`);
        }
        const videos = (await videosResp.json()) as YouTubeVideosResponse;
        const video = videos.items?.[0];
        if (!video) {
            return { externalPostId, metrics: { likes: 0, comments: 0, shares: 0 } };
        }

        // Optional subscriber count for channel-aware metrics (best-effort).
        let subscribers: number | undefined;
        if (video.snippet?.channelId) {
            const chResp = await fetch(
                `${YT_BASE}/channels?part=statistics&id=${encodeURIComponent(video.snippet.channelId)}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (chResp.ok) {
                const ch = (await chResp.json()) as YouTubeChannelsResponse;
                subscribers = toNumber(ch.items?.[0]?.statistics?.subscriberCount);
            }
        }

        const views = toNumber(video.statistics?.viewCount) ?? 0;
        const likes = toNumber(video.statistics?.likeCount) ?? 0;
        const comments = toNumber(video.statistics?.commentCount) ?? 0;

        return {
            externalPostId,
            postUrl: `https://www.youtube.com/watch?v=${externalPostId}`,
            metrics: {
                likes,
                comments,
                shares: 0, // YouTube no longer exposes share counts on the public API
                videoViews: views,
                followers: subscribers,
                engagementRate: views > 0 ? (likes + comments) / views : undefined,
            },
        };
    }
}

export const youtubeFetcher = new YouTubeFetcher();
