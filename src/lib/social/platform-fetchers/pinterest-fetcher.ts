/**
 * Pinterest pin metrics fetcher.
 *
 * Uses Pinterest API v5: `GET /v5/pins/{pin_id}/analytics`.
 * Auth is OAuth Bearer.
 *
 * `externalPostId` is the Pinterest pin id.
 */

import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

const PINTEREST_BASE = 'https://api.pinterest.com/v5';

interface PinAnalyticsResponse {
    all?: {
        daily_metrics?: Array<{
            date: string;
            data_status: string;
            metrics: {
                IMPRESSION?: number;
                SAVE?: number;
                PIN_CLICK?: number;
                OUTBOUND_CLICK?: number;
                VIDEO_MRC_VIEW?: number;
                ENGAGEMENT?: number;
            };
        }>;
        summary_metrics?: {
            IMPRESSION?: number;
            SAVE?: number;
            PIN_CLICK?: number;
            OUTBOUND_CLICK?: number;
            VIDEO_MRC_VIEW?: number;
            ENGAGEMENT?: number;
        };
    };
}

interface PinDetailsResponse {
    id: string;
    link?: string;
}

export class PinterestFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'pinterest';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
        if (!accountData?.accessToken) {
            throw new Error(`Pinterest access token not found for account ${socialAccountId}`);
        }
        const { accessToken } = accountData;

        // Pinterest's analytics endpoint requires a date range. We use the last 90 days
        // (the max retention) so the summary covers the lifetime of any reasonably
        // recent pin.
        const end = new Date();
        const start = new Date(end.getTime() - 89 * 24 * 60 * 60 * 1000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

        const params = new URLSearchParams({
            start_date: fmt(start),
            end_date: fmt(end),
            metric_types: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,VIDEO_MRC_VIEW,ENGAGEMENT',
        });

        const analyticsUrl = `${PINTEREST_BASE}/pins/${encodeURIComponent(externalPostId)}/analytics?${params}`;
        const analyticsResp = await fetch(analyticsUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!analyticsResp.ok) {
            const error = await analyticsResp.text();
            throw new Error(`Pinterest analytics fetch failed: ${analyticsResp.status} - ${error}`);
        }
        const analytics = (await analyticsResp.json()) as PinAnalyticsResponse;
        const s = analytics.all?.summary_metrics ?? {};

        // Optional: fetch pin details for the URL.
        const detailsResp = await fetch(
            `${PINTEREST_BASE}/pins/${encodeURIComponent(externalPostId)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        let postUrl: string | undefined;
        if (detailsResp.ok) {
            const details = (await detailsResp.json()) as PinDetailsResponse;
            postUrl = details.link;
        }

        return {
            externalPostId,
            postUrl,
            metrics: {
                likes: 0, // Pinterest doesn't expose likes — they were merged into saves
                comments: 0,
                shares: 0,
                impressions: s.IMPRESSION,
                saves: s.SAVE,
                clicks: (s.PIN_CLICK ?? 0) + (s.OUTBOUND_CLICK ?? 0),
                videoViews: s.VIDEO_MRC_VIEW,
                engagementRate:
                    s.IMPRESSION && s.IMPRESSION > 0
                        ? (s.ENGAGEMENT ?? 0) / s.IMPRESSION
                        : undefined,
            },
        };
    }
}

export const pinterestFetcher = new PinterestFetcher();
