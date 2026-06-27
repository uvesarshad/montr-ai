/**
 * Analytics fetcher framework — every connected source type implements
 * this interface; the sync scheduler drives them uniformly.
 *
 * Contract:
 * - fetch() returns daily MetricRows for the inclusive window. It must be
 *   idempotent — rows are upserted on (sourceId, entityType, entityId, date).
 * - Only ADDITIVE metrics are stored (spend, impressions, clicks, sessions,
 *   conversions, ...). Ratios (CTR, CPC) are computed at query time so
 *   aggregation across days/entities stays correct.
 * - Tokens MUST come from src/lib/ads/token-refresh.ts.
 */
import type { MetricsSourceType } from '@/lib/db/models/metrics-snapshot.model';
import type { MetricRow } from '@/lib/db/repository/metrics-snapshot.repository';

export type { MetricRow };

export interface FetchWindow {
    /** Inclusive, 'YYYY-MM-DD' */
    dateFrom: string;
    /** Inclusive, 'YYYY-MM-DD' */
    dateTo: string;
}

/** Which connection collection the fetcher's connectionId refers to */
export type ConnectionKind = 'ad_account' | 'analytics_source' | 'social_account';

export interface AnalyticsFetcher {
    sourceType: MetricsSourceType;
    connectionKind: ConnectionKind;
    /**
     * Fetch daily metrics for one connection over the window.
     * connectionId is the _id of the AdAccount / AnalyticsSource /
     * SocialAccount document.
     */
    fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]>;
}

/** Format a Date as 'YYYY-MM-DD' (UTC) */
export function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Window helper: the N days ending yesterday (UTC) */
export function lastNDaysWindow(days: number): FetchWindow {
    const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    return { dateFrom: toDateKey(start), dateTo: toDateKey(end) };
}

/** Coerce platform string/number metric values to numbers, dropping NaNs */
export function toMetricNumber(value: unknown): number {
    const num = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(num) ? num : 0;
}
