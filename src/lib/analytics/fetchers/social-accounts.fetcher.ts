/**
 * Account-level social insights fetchers, built on the existing social
 * module connections (SocialAccount).
 *
 * Coverage:
 * - facebook:  Page Insights daily (impressions, engagements, fans total)
 * - instagram: account insights daily (reach, new followers)
 * - threads:   daily views + followers snapshot
 * - linkedin:  organization follower/share stats (daily where the API
 *              provides it, otherwise snapshot)
 * - tiktok:    follower/likes totals snapshot (the social connection's
 *              scopes only cover basic user info)
 * - x:         follower/post totals snapshot via /2/users/me public_metrics
 *              (available on the free API tier; richer time-bound analytics
 *              would need a paid tier). The free tier's request cap is tiny —
 *              the 6-hourly cron (4 calls/day/account) stays inside it.
 *
 * Post-level metrics remain in src/lib/social/platform-fetchers/.
 */
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import type { ISocialAccount, SocialPlatform } from '@/lib/db/models/social-account.model';
import type { MetricsSourceType } from '@/lib/db/models/metrics-snapshot.model';
import { AnalyticsFetcher, FetchWindow, MetricRow, toDateKey, toMetricNumber } from './types';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0';

interface SocialContext {
    account: ISocialAccount;
    accessToken: string;
    brandId: string;
}

async function resolveSocialContext(connectionId: string, platform: SocialPlatform): Promise<SocialContext> {
    const decrypted = await socialAccountRepository.findByIdWithTokens(connectionId);
    if (!decrypted || decrypted.account.platform !== platform) {
        throw new Error(`${platform} social account ${connectionId} not found`);
    }

    const brand = await brandRepository.findById(decrypted.account.brandId);
    return {
        account: decrypted.account,
        accessToken: decrypted.accessToken,
        brandId: decrypted.account.brandId,
    };
}

function baseRow(context: SocialContext, sourceType: MetricsSourceType, connectionId: string) {
    return {
        brandId: context.brandId,
        sourceType,
        sourceId: connectionId,
        entityType: 'account' as const,
        entityId: context.account.platformAccountId,
        entityName: context.account.platformDisplayName || context.account.platformUsername,
    };
}

/** Wrap a fetch body with markUsed/recordError bookkeeping */
async function withBookkeeping(connectionId: string, label: string, run: () => Promise<MetricRow[]>): Promise<MetricRow[]> {
    try {
        const rows = await run();
        await socialAccountRepository.markUsed(connectionId);
        return rows;
    } catch (error) {
        const message = error instanceof Error ? error.message : `${label} sync failed`;
        await socialAccountRepository.recordError(connectionId, message);
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Meta Graph insights shape (Facebook Pages + Instagram accounts)
// ---------------------------------------------------------------------------

interface GraphInsightValue {
    value?: number | Record<string, number>;
    end_time?: string;
}

interface GraphInsightMetric {
    name?: string;
    period?: string;
    values?: GraphInsightValue[];
    total_value?: { value?: number };
}

interface GraphInsightsResponse {
    data?: GraphInsightMetric[];
}

/** Graph end_time marks the END of the day bucket — shift back one day */
function endTimeToDateKey(endTime?: string): string | null {
    if (!endTime) return null;
    const parsed = new Date(endTime);
    if (Number.isNaN(parsed.getTime())) return null;
    return toDateKey(new Date(parsed.getTime() - 24 * 60 * 60 * 1000));
}

async function fetchGraphInsights(
    base: string,
    entityId: string,
    accessToken: string,
    metrics: string[],
    window: FetchWindow,
    extraParams?: Record<string, string>,
): Promise<GraphInsightMetric[]> {
    const url = new URL(`${base}/${entityId}/insights`);
    url.searchParams.set('metric', metrics.join(','));
    url.searchParams.set('period', 'day');
    url.searchParams.set('since', window.dateFrom);
    url.searchParams.set('until', window.dateTo);
    url.searchParams.set('access_token', accessToken);
    for (const [key, value] of Object.entries(extraParams || {})) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Graph insights fetch failed: ${await response.text()}`);
    }

    const body: GraphInsightsResponse = await response.json();
    return body.data || [];
}

/** Pivot Graph metric series into per-day metric maps */
function pivotGraphSeries(
    series: GraphInsightMetric[],
    metricKeyMap: Record<string, string>,
): Map<string, Record<string, number>> {
    const byDate = new Map<string, Record<string, number>>();

    for (const metric of series) {
        const key = metric.name ? metricKeyMap[metric.name] : undefined;
        if (!key) continue;

        for (const value of metric.values || []) {
            const date = endTimeToDateKey(value.end_time);
            if (!date) continue;
            const raw = typeof value.value === 'number' ? value.value : 0;
            const existing = byDate.get(date) || {};
            existing[key] = toMetricNumber(raw);
            byDate.set(date, existing);
        }
    }

    return byDate;
}

// ---------------------------------------------------------------------------
// Facebook Page
// ---------------------------------------------------------------------------

const FB_PAGE_METRICS: Record<string, string> = {
    page_impressions: 'impressions',
    page_post_engagements: 'engagements',
    page_fans: 'followers_total', // lifetime total reported daily — snapshot, do not sum
};

export const facebookPageFetcher: AnalyticsFetcher = {
    sourceType: 'facebook',
    connectionKind: 'social_account',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const context = await resolveSocialContext(connectionId, 'facebook');

        return withBookkeeping(connectionId, 'Facebook Page', async () => {
            const series = await fetchGraphInsights(
                FB_GRAPH_BASE,
                context.account.platformAccountId,
                context.accessToken,
                Object.keys(FB_PAGE_METRICS),
                window,
            );

            const byDate = pivotGraphSeries(series, FB_PAGE_METRICS);
            return Array.from(byDate.entries()).map(([date, metrics]) => ({
                ...baseRow(context, 'facebook', connectionId),
                entityType: 'page' as const,
                date,
                metrics,
            }));
        });
    },
};

// ---------------------------------------------------------------------------
// Instagram account
// ---------------------------------------------------------------------------

const IG_ACCOUNT_METRICS: Record<string, string> = {
    reach: 'reach',
    follower_count: 'new_followers', // daily delta
};

export const instagramAccountFetcher: AnalyticsFetcher = {
    sourceType: 'instagram',
    connectionKind: 'social_account',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const context = await resolveSocialContext(connectionId, 'instagram');

        return withBookkeeping(connectionId, 'Instagram', async () => {
            const series = await fetchGraphInsights(
                FB_GRAPH_BASE,
                context.account.platformAccountId,
                context.accessToken,
                Object.keys(IG_ACCOUNT_METRICS),
                window,
            );

            const byDate = pivotGraphSeries(series, IG_ACCOUNT_METRICS);
            return Array.from(byDate.entries()).map(([date, metrics]) => ({
                ...baseRow(context, 'instagram', connectionId),
                date,
                metrics,
            }));
        });
    },
};

// ---------------------------------------------------------------------------
// Threads account
// ---------------------------------------------------------------------------

export const threadsAccountFetcher: AnalyticsFetcher = {
    sourceType: 'threads',
    connectionKind: 'social_account',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const context = await resolveSocialContext(connectionId, 'threads');

        return withBookkeeping(connectionId, 'Threads', async () => {
            // Threads insights use unix timestamps and its own Graph host
            const since = Math.floor(new Date(`${window.dateFrom}T00:00:00Z`).getTime() / 1000);
            const until = Math.floor(new Date(`${window.dateTo}T23:59:59Z`).getTime() / 1000);

            const url = new URL(`${THREADS_GRAPH_BASE}/${context.account.platformAccountId}/threads_insights`);
            url.searchParams.set('metric', 'views,followers_count');
            url.searchParams.set('since', String(since));
            url.searchParams.set('until', String(until));
            url.searchParams.set('access_token', context.accessToken);

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`Threads insights fetch failed: ${await response.text()}`);
            }

            const body: GraphInsightsResponse = await response.json();
            const rows: MetricRow[] = [];

            // views comes back as a daily series
            const viewsByDate = pivotGraphSeries(
                (body.data || []).filter((metric) => metric.name === 'views'),
                { views: 'views' },
            );
            for (const [date, metrics] of viewsByDate.entries()) {
                rows.push({ ...baseRow(context, 'threads', connectionId), date, metrics });
            }

            // followers_count is total_value only — store as today's snapshot
            const followers = (body.data || []).find((metric) => metric.name === 'followers_count');
            const followersTotal = followers?.total_value?.value;
            if (followersTotal !== undefined) {
                const today = toDateKey(new Date());
                const existing = rows.find((row) => row.date === today);
                if (existing) {
                    existing.metrics.followers_total = toMetricNumber(followersTotal);
                } else {
                    rows.push({
                        ...baseRow(context, 'threads', connectionId),
                        date: today,
                        metrics: { followers_total: toMetricNumber(followersTotal) },
                    });
                }
            }

            return rows;
        });
    },
};

// ---------------------------------------------------------------------------
// LinkedIn organization
// ---------------------------------------------------------------------------

export const linkedinOrgFetcher: AnalyticsFetcher = {
    sourceType: 'linkedin',
    connectionKind: 'social_account',

    async fetch(connectionId: string, _window: FetchWindow): Promise<MetricRow[]> {
        const context = await resolveSocialContext(connectionId, 'linkedin');

        return withBookkeeping(connectionId, 'LinkedIn', async () => {
            // Organization follower count snapshot via networkSizes (the
            // time-bound statistics endpoints need Community Management
            // review; revisit once that access is approved).
            const orgId = context.account.platformAccountId;
            const url = `https://api.linkedin.com/v2/networkSizes/urn:li:organization:${orgId}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${context.accessToken}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });

            if (!response.ok) {
                throw new Error(`LinkedIn follower fetch failed: ${await response.text()}`);
            }

            const body = await response.json();
            return [{
                ...baseRow(context, 'linkedin', connectionId),
                date: toDateKey(new Date()),
                metrics: { followers_total: toMetricNumber(body.firstDegreeSize) },
            }];
        });
    },
};

// ---------------------------------------------------------------------------
// TikTok account
// ---------------------------------------------------------------------------

export const tiktokAccountFetcher: AnalyticsFetcher = {
    sourceType: 'tiktok',
    connectionKind: 'social_account',

    async fetch(connectionId: string, _window: FetchWindow): Promise<MetricRow[]> {
        const context = await resolveSocialContext(connectionId, 'tiktok');

        return withBookkeeping(connectionId, 'TikTok', async () => {
            // The social connection's scopes only cover basic user info —
            // store follower/likes totals as a daily snapshot.
            const url = new URL('https://open.tiktokapis.com/v2/user/info/');
            url.searchParams.set('fields', 'follower_count,following_count,likes_count,video_count');

            const response = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${context.accessToken}` },
            });

            if (!response.ok) {
                throw new Error(`TikTok user info fetch failed: ${await response.text()}`);
            }

            const body = await response.json();
            const user = body.data?.user;
            if (!user) return [];

            return [{
                ...baseRow(context, 'tiktok', connectionId),
                date: toDateKey(new Date()),
                metrics: {
                    followers_total: toMetricNumber(user.follower_count),
                    likes_total: toMetricNumber(user.likes_count),
                    videos_total: toMetricNumber(user.video_count),
                },
            }];
        });
    },
};

// ---------------------------------------------------------------------------
// X (Twitter) account
// ---------------------------------------------------------------------------

/**
 * Free tier (default): follower/post totals snapshot via /2/users/me.
 * X_API_TIER=basic additionally pulls the recent post timeline (tweet
 * public_metrics include impression_count) and aggregates per-day posts /
 * impressions / likes / reposts / replies. Backfill is capped to 30 days so
 * the 6-hourly cron stays well inside the Basic tier's 10k-posts/month read
 * budget. The per-plan packaging decision is tracked in
 * docs/plan/ads-far-future-todo-2026-06-06.md (B1).
 */
const X_API_TIER = process.env.X_API_TIER === 'basic' ? 'basic' : 'free';
const X_TIMESERIES_MAX_DAYS = 30;

interface XTweetRow {
    created_at?: string;
    public_metrics?: {
        impression_count?: number;
        like_count?: number;
        retweet_count?: number;
        reply_count?: number;
        quote_count?: number;
    };
}

async function fetchXDailyMetrics(
    accessToken: string,
    userId: string,
    window: FetchWindow,
): Promise<Map<string, Record<string, number>>> {
    const byDate = new Map<string, Record<string, number>>();

    // Cap the window — backfills would otherwise burn the monthly read budget
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(`${window.dateFrom}T00:00:00Z`);
    const cappedFrom = new Date(Math.max(from.getTime(), Date.now() - X_TIMESERIES_MAX_DAYS * day));

    let paginationToken: string | undefined;
    let pages = 0;

    do {
        const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
        url.searchParams.set('max_results', '100');
        url.searchParams.set('start_time', cappedFrom.toISOString());
        url.searchParams.set('end_time', new Date(`${window.dateTo}T23:59:59Z`).toISOString());
        url.searchParams.set('tweet.fields', 'created_at,public_metrics');
        if (paginationToken) url.searchParams.set('pagination_token', paginationToken);

        const response = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            throw new Error(`X timeline fetch failed: ${await response.text()}`);
        }

        const body = await response.json();
        for (const tweet of (body.data || []) as XTweetRow[]) {
            if (!tweet.created_at) continue;
            const date = tweet.created_at.slice(0, 10);
            const existing = byDate.get(date) || { posts: 0, impressions: 0, likes: 0, reposts: 0, replies: 0 };
            existing.posts += 1;
            existing.impressions += toMetricNumber(tweet.public_metrics?.impression_count);
            existing.likes += toMetricNumber(tweet.public_metrics?.like_count);
            existing.reposts += toMetricNumber(tweet.public_metrics?.retweet_count) + toMetricNumber(tweet.public_metrics?.quote_count);
            existing.replies += toMetricNumber(tweet.public_metrics?.reply_count);
            byDate.set(date, existing);
        }

        paginationToken = body.meta?.next_token;
        pages += 1;
    } while (paginationToken && pages < 3); // ≤300 posts per sync

    return byDate;
}

export const xAccountFetcher: AnalyticsFetcher = {
    sourceType: 'x',
    connectionKind: 'social_account',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const context = await resolveSocialContext(connectionId, 'x');

        return withBookkeeping(connectionId, 'X', async () => {
            const url = new URL('https://api.x.com/2/users/me');
            url.searchParams.set('user.fields', 'public_metrics');

            const response = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${context.accessToken}` },
            });

            if (!response.ok) {
                throw new Error(`X user info fetch failed: ${await response.text()}`);
            }

            const body = await response.json();
            const metrics = body.data?.public_metrics;
            if (!metrics) return [];

            const today = toDateKey(new Date());
            const rows: MetricRow[] = [{
                ...baseRow(context, 'x', connectionId),
                date: today,
                metrics: {
                    followers_total: toMetricNumber(metrics.followers_count),
                    following_total: toMetricNumber(metrics.following_count),
                    posts_total: toMetricNumber(metrics.tweet_count),
                    listed_total: toMetricNumber(metrics.listed_count),
                },
            }];

            // Basic tier: per-day post performance on top of the snapshot
            if (X_API_TIER === 'basic' && body.data?.id) {
                const daily = await fetchXDailyMetrics(context.accessToken, String(body.data.id), window);
                for (const [date, dayMetrics] of daily.entries()) {
                    if (date === today) {
                        Object.assign(rows[0].metrics, dayMetrics);
                    } else {
                        rows.push({
                            ...baseRow(context, 'x', connectionId),
                            date,
                            metrics: dayMetrics,
                        });
                    }
                }
            }

            return rows;
        });
    },
};

