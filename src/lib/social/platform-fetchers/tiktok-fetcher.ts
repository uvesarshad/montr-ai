/**
 * TikTok video metrics fetcher.
 *
 * Uses the TikTok for Business API (Marketing API) — different from TikTok's
 * consumer API. Endpoint: `POST /v1.3/video/list/` with filtering by video id
 * returns video-level analytics.
 *
 * `externalPostId` is the TikTok video id.
 */

import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

const TIKTOK_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

interface TikTokVideoListResponse {
    data?: {
        videos?: Array<{
            video_id: string;
            share_url?: string;
            video_views?: number;
            likes?: number;
            comments?: number;
            shares?: number;
            reach?: number;
            full_video_watched_rate?: number;
        }>;
    };
}

export class TikTokFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'tiktok';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
        if (!accountData?.accessToken) {
            throw new Error(`TikTok access token not found for account ${socialAccountId}`);
        }
        const { accessToken } = accountData;

        // The account doc carries advertiser_id under metadata for TikTok Business
        // accounts. Consumer-only OAuth grants don't expose an advertiser_id at
        // connect time (audit C7), so degrade gracefully — skip with a logged
        // warning and return zero metrics rather than failing the whole sync.
        const advertiserId = (accountData.account as { metadata?: { advertiserId?: string } }).metadata?.advertiserId;
        if (!advertiserId) {
            console.warn(
                `[tiktok-fetcher] No advertiser_id on social account ${socialAccountId} — ` +
                `skipping metrics (reconnect via a TikTok Business app to enable analytics).`
            );
            return { externalPostId, metrics: { likes: 0, comments: 0, shares: 0 } };
        }

        const url = `${TIKTOK_BASE}/video/list/?advertiser_id=${encodeURIComponent(advertiserId)}` +
            `&filtering=${encodeURIComponent(JSON.stringify({ video_ids: [externalPostId] }))}` +
            `&fields=${encodeURIComponent(JSON.stringify([
                'video_id', 'share_url', 'video_views', 'likes', 'comments', 'shares', 'reach',
                'full_video_watched_rate',
            ]))}`;

        const response = await fetch(url, {
            headers: {
                'Access-Token': accessToken,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`TikTok API error: ${response.status} - ${error}`);
        }
        const data = (await response.json()) as TikTokVideoListResponse;
        const video = data.data?.videos?.find(v => v.video_id === externalPostId) ?? data.data?.videos?.[0];

        if (!video) {
            return { externalPostId, metrics: { likes: 0, comments: 0, shares: 0 } };
        }

        return {
            externalPostId,
            postUrl: video.share_url,
            metrics: {
                likes: video.likes ?? 0,
                comments: video.comments ?? 0,
                shares: video.shares ?? 0,
                reach: video.reach,
                videoViews: video.video_views,
                engagementRate:
                    video.reach && video.reach > 0
                        ? ((video.likes ?? 0) + (video.comments ?? 0) + (video.shares ?? 0)) / video.reach
                        : video.full_video_watched_rate,
            },
        };
    }
}

export const tiktokFetcher = new TikTokFetcher();
