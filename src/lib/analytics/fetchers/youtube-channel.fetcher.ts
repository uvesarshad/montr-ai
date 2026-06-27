/**
 * YouTube channel fetcher — daily channel metrics via the YouTube
 * Analytics API when the connection's scopes allow it, with a fallback
 * to cumulative Data-API statistics snapshots (stored for "today" only)
 * for connections made before the yt-analytics scope was added.
 *
 * Uses the existing social-module YouTube connection (SocialAccount).
 */
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { AnalyticsFetcher, FetchWindow, MetricRow, toDateKey, toMetricNumber } from './types';

const YT_ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const YT_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Social accounts have no shared refresh service yet — handle the Google
 * refresh-token grant here using the YouTube OAuth client.
 */
async function getFreshYoutubeToken(connectionId: string): Promise<{
    accessToken: string;
    brandId: string;
    channelId: string;
    channelName: string;
}> {
    const decrypted = await socialAccountRepository.findByIdWithTokens(connectionId);
    if (!decrypted || decrypted.account.platform !== 'youtube') {
        throw new Error(`YouTube social account ${connectionId} not found`);
    }

    const { account, accessToken, refreshToken } = decrypted;
    const base = {
        brandId: account.brandId,
        channelId: account.platformAccountId,
        channelName: account.platformDisplayName || account.platformUsername,
    };

    const expiresAt = account.tokenExpiresAt;
    if (!expiresAt || expiresAt.getTime() > Date.now() + REFRESH_MARGIN_MS) {
        return { accessToken, ...base };
    }

    if (!refreshToken) {
        throw new Error('YouTube token expired and no refresh token stored — please reconnect');
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('YouTube OAuth is not configured');
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) {
        throw new Error(`YouTube token refresh failed: ${await response.text()}`);
    }

    const data = await response.json();
    const newExpiresAt = new Date(Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000));
    await socialAccountRepository.updateTokens(connectionId, data.access_token, undefined, newExpiresAt);

    return { accessToken: data.access_token as string, ...base };
}

interface YtAnalyticsResponse {
    rows?: (string | number)[][];
}

async function fetchDailyAnalytics(
    accessToken: string,
    window: FetchWindow,
): Promise<{ rows: (string | number)[][]; supported: boolean }> {
    const url = new URL(YT_ANALYTICS_URL);
    url.searchParams.set('ids', 'channel==MINE');
    url.searchParams.set('startDate', window.dateFrom);
    url.searchParams.set('endDate', window.dateTo);
    url.searchParams.set('metrics', 'views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments');
    url.searchParams.set('dimensions', 'day');

    const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (response.status === 401 || response.status === 403) {
        // Connection lacks the yt-analytics.readonly scope — fall back
        return { rows: [], supported: false };
    }
    if (!response.ok) {
        throw new Error(`YouTube Analytics fetch failed: ${await response.text()}`);
    }

    const body: YtAnalyticsResponse = await response.json();
    return { rows: body.rows || [], supported: true };
}

async function fetchStatisticsSnapshot(accessToken: string): Promise<Record<string, number> | null> {
    const url = new URL(YT_CHANNELS_URL);
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('mine', 'true');

    const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`YouTube channel statistics fetch failed: ${await response.text()}`);
    }

    const body = await response.json();
    const stats = body.items?.[0]?.statistics;
    if (!stats) return null;

    return {
        views_total: toMetricNumber(stats.viewCount),
        subscribers_total: toMetricNumber(stats.subscriberCount),
        videos_total: toMetricNumber(stats.videoCount),
    };
}

export const youtubeChannelFetcher: AnalyticsFetcher = {
    sourceType: 'youtube',
    connectionKind: 'social_account',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const { accessToken, brandId, channelId, channelName } = await getFreshYoutubeToken(connectionId);

        const brand = await brandRepository.findById(brandId);
        try {
            const base = {
                brandId,
                sourceType: 'youtube' as const,
                sourceId: connectionId,
                entityType: 'channel' as const,
                entityId: channelId,
                entityName: channelName,
            };

            const { rows, supported } = await fetchDailyAnalytics(accessToken, window);

            if (supported) {
                const metricRows: MetricRow[] = [];
                for (const row of rows) {
                    const [day, views, minutesWatched, subsGained, subsLost, likes, comments] = row;
                    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;

                    metricRows.push({
                        ...base,
                        date: day,
                        metrics: {
                            views: toMetricNumber(views),
                            minutes_watched: toMetricNumber(minutesWatched),
                            subscribers_gained: toMetricNumber(subsGained),
                            subscribers_lost: toMetricNumber(subsLost),
                            likes: toMetricNumber(likes),
                            comments: toMetricNumber(comments),
                        },
                    });
                }
                await socialAccountRepository.markUsed(connectionId);
                return metricRows;
            }

            // Fallback: cumulative totals snapshot for today
            const snapshot = await fetchStatisticsSnapshot(accessToken);
            await socialAccountRepository.markUsed(connectionId);
            if (!snapshot) return [];

            return [{
                ...base,
                date: toDateKey(new Date()),
                metrics: snapshot,
            }];
        } catch (error) {
            const message = error instanceof Error ? error.message : 'YouTube sync failed';
            await socialAccountRepository.recordError(connectionId, message);
            throw error;
        }
    },
};

export default youtubeChannelFetcher;
