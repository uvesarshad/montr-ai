/**
 * Google Business Profile location metrics fetcher.
 *
 * Unlike the other social platforms, Google Business has no per-post engagement
 * surface — performance is reported at the *location* level via the Business
 * Profile Performance API:
 *   GET https://businessprofileperformance.googleapis.com/v1/{location}:fetchMultiDailyMetricsTimeSeries
 *       ?dailyMetrics=...&dailyRange.start_date.year=...&dailyRange.end_date.year=...
 *
 * The location resource (`accounts/{id}/locations/{id}`) is captured at connect
 * time and stored in `account.metadata.locationName` (same place the publish
 * flow reads it). The Performance API addresses the location as `locations/{id}`.
 *
 * `externalPostId` is accepted for interface parity but is not used — there is
 * no per-post metric. If the location metadata is missing we return zeros
 * gracefully rather than throwing, so callers degrade cleanly.
 */

import { IPlatformFetcher, PostMetricResult } from './types';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { MetricPlatform } from '@/lib/db/models/analytics.model';

const PERFORMANCE_BASE = 'https://businessprofileperformance.googleapis.com/v1';

// Daily metrics exposed by the Performance API (subset relevant to engagement).
const DAILY_METRICS = [
    'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
    'CALL_CLICKS',
    'WEBSITE_CLICKS',
    'BUSINESS_DIRECTION_REQUESTS',
] as const;

interface DatedValue {
    date?: { year?: number; month?: number; day?: number };
    value?: string;
}

interface MultiDailyMetricTimeSeriesResponse {
    multiDailyMetricTimeSeries?: Array<{
        dailyMetricTimeSeries?: Array<{
            dailyMetric?: string;
            timeSeries?: { datedValues?: DatedValue[] };
        }>;
    }>;
}

function sumSeries(datedValues: DatedValue[] | undefined): number {
    if (!datedValues) return 0;
    return datedValues.reduce((acc, dv) => acc + (Number(dv.value) || 0), 0);
}

export class GoogleBusinessFetcher implements IPlatformFetcher {
    platform: MetricPlatform = 'google_business';

    async fetchPostMetrics(socialAccountId: string, externalPostId: string): Promise<PostMetricResult> {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
        if (!accountData?.accessToken) {
            throw new Error(`Google Business access token not found for account ${socialAccountId}`);
        }
        const { account, accessToken } = accountData;

        // Location parent captured at connect time (`accounts/{id}/locations/{id}`).
        const locationName = account.metadata?.locationName as string | undefined;
        if (!locationName) {
            // No location selected — degrade to zeros rather than failing the run.
            return { externalPostId, metrics: { likes: 0, comments: 0, shares: 0 } };
        }
        // The Performance API addresses a location as `locations/{id}`.
        const locationPath = locationName.includes('/locations/')
            ? `locations/${locationName.split('/locations/')[1]}`
            : locationName;

        // Last 30 days window.
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);

        const params = new URLSearchParams();
        for (const metric of DAILY_METRICS) params.append('dailyMetrics', metric);
        params.set('dailyRange.start_date.year', String(start.getUTCFullYear()));
        params.set('dailyRange.start_date.month', String(start.getUTCMonth() + 1));
        params.set('dailyRange.start_date.day', String(start.getUTCDate()));
        params.set('dailyRange.end_date.year', String(end.getUTCFullYear()));
        params.set('dailyRange.end_date.month', String(end.getUTCMonth() + 1));
        params.set('dailyRange.end_date.day', String(end.getUTCDate()));

        const url = `${PERFORMANCE_BASE}/${locationPath}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;
        const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) {
            const error = await resp.text();
            throw new Error(`Google Business performance fetch failed: ${resp.status} - ${error}`);
        }
        const data = (await resp.json()) as MultiDailyMetricTimeSeriesResponse;

        let impressions = 0;
        let clicks = 0;
        let profileVisits = 0;
        for (const multi of data.multiDailyMetricTimeSeries ?? []) {
            for (const series of multi.dailyMetricTimeSeries ?? []) {
                const total = sumSeries(series.timeSeries?.datedValues);
                const metric = series.dailyMetric ?? '';
                if (metric.startsWith('BUSINESS_IMPRESSIONS_')) {
                    impressions += total;
                } else if (metric === 'CALL_CLICKS' || metric === 'WEBSITE_CLICKS' || metric === 'BUSINESS_DIRECTION_REQUESTS') {
                    clicks += total;
                }
            }
        }
        // Total impressions double as a proxy for profile visits/reach surface.
        profileVisits = impressions;

        return {
            externalPostId,
            metrics: {
                // No likes/comments/shares surface on Business Profile.
                likes: 0,
                comments: 0,
                shares: 0,
                impressions,
                reach: impressions,
                clicks,
                profileVisits,
            },
        };
    }
}

export const googleBusinessFetcher = new GoogleBusinessFetcher();
