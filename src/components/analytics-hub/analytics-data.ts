/**
 * Client-side helpers for the Analytics module — generic wrappers over
 * /api/v2/analytics/* for any source type.
 */

export type AnalyticsSourceType =
    | 'meta_ads' | 'google_ads' | 'ga4' | 'search_console' | 'youtube'
    | 'facebook' | 'instagram' | 'threads' | 'linkedin' | 'tiktok' | 'x';

export interface SummaryResponse {
    dateFrom: string;
    dateTo: string;
    totals: Record<string, number>;
    bySourceType: Record<string, Record<string, number>>;
    sources: number;
}

export interface TimeseriesPoint {
    date: string;
    metrics: Record<string, number>;
}

export interface BreakdownEntity {
    sourceType: string;
    sourceId: string;
    entityType: string;
    entityId: string;
    entityName: string | null;
    parentEntityId: string | null;
    metrics: Record<string, number>;
}

export interface AnalyticsSourceDto {
    _id: string;
    sourceType: 'ga4' | 'search_console';
    externalId: string;
    displayName: string;
    brandId: string;
    isActive: boolean;
    lastSyncedAt?: string;
    lastError?: string;
    metadata?: { accountName?: string; permissionLevel?: string };
    createdAt: string;
}

export function rangeForDays(days: number): { dateFrom: string; dateTo: string } {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    return {
        dateFrom: start.toISOString().slice(0, 10),
        dateTo: end.toISOString().slice(0, 10),
    };
}

function buildParams(days: number, brandId?: string | null, extra?: Record<string, string>): URLSearchParams {
    const { dateFrom, dateTo } = rangeForDays(days);
    const params = new URLSearchParams({ dateFrom, dateTo, ...extra });
    if (brandId) params.set('brandId', brandId);
    return params;
}

async function getJson<T>(url: string): Promise<T | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

export function fetchSummary(sourceType: AnalyticsSourceType | null, days: number, brandId?: string | null) {
    return getJson<SummaryResponse>(
        `/api/v2/analytics/summary?${buildParams(days, brandId, sourceType ? { sourceType } : undefined)}`,
    );
}

export function fetchTimeseries(sourceType: AnalyticsSourceType, days: number, brandId?: string | null, entity?: { entityType: string; entityId?: string }) {
    const extra: Record<string, string> = { sourceType };
    if (entity) {
        extra.entityType = entity.entityType;
        if (entity.entityId) extra.entityId = entity.entityId;
    }
    return getJson<{ series: TimeseriesPoint[] }>(`/api/v2/analytics/timeseries?${buildParams(days, brandId, extra)}`);
}

export function fetchBreakdown(sourceType: AnalyticsSourceType, entityType: string, days: number, brandId?: string | null) {
    return getJson<{ entities: BreakdownEntity[] }>(
        `/api/v2/analytics/breakdown?${buildParams(days, brandId, { sourceType, entityType })}`,
    );
}

export function fetchAnalyticsSources(brandId?: string | null) {
    const params = new URLSearchParams();
    if (brandId) params.set('brandId', brandId);
    return getJson<{ sources: AnalyticsSourceDto[] }>(`/api/v2/analytics/sources?${params}`);
}

/* ── chart + format helpers (shared with the Ads module style) ───────── */

export function fmtNum(value: number | undefined): string {
    if (!value) return '0';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
    return Math.round(value).toLocaleString();
}

export function fmtMoney(value: number | undefined, currency = 'USD'): string {
    if (!value) return '—';
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            maximumFractionDigits: value >= 1000 ? 0 : 2,
        }).format(value);
    } catch {
        return value.toFixed(2);
    }
}

/** Build an AreaChart series + labels from a timeseries for one metric */
export function seriesForMetric(
    points: TimeseriesPoint[],
    metric: string,
    name: string,
    color: string,
): { series: { name: string; color: string; data: number[] }[]; labels: { x: number; t: string }[] } | null {
    if (points.length < 2) return null;
    const data = points.map((point) => point.metrics[metric] || 0);
    if (!data.some((value) => value > 0)) return null;
    const tickEvery = Math.max(1, Math.floor(points.length / 6));
    return {
        series: [{ name, color, data }],
        labels: points
            .map((point, index) => ({ x: index, t: point.date.slice(5) }))
            .filter((_, index) => index % tickEvery === 0),
    };
}
