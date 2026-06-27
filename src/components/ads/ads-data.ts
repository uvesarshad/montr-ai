/**
 * Client-side data helpers for the Ads module pages — thin wrappers over
 * /api/v2/analytics/* and /api/v2/ads/*.
 */

export type AdsPlatform = 'meta_ads' | 'google_ads';

export const PLATFORM_LABELS: Record<AdsPlatform, string> = {
    meta_ads: 'Meta',
    google_ads: 'Google',
};

export interface AdsSummary {
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

export interface AdAccountDto {
    _id: string;
    platform: AdsPlatform;
    externalAccountId: string;
    accountName: string;
    currencyCode?: string;
    timezone?: string;
    brandId: string;
    isActive: boolean;
    lastSyncedAt?: string;
    lastError?: string;
    webhookKey?: string;
    createdAt: string;
}

export interface AdLeadDto {
    _id: string;
    platform: AdsPlatform;
    campaignName?: string;
    campaignId?: string;
    formId?: string;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    fields: Record<string, string>;
    status: 'received' | 'synced' | 'failed' | 'skipped';
    error?: string;
    contactId?: string;
    isTest?: boolean;
    receivedAt: string;
    syncedAt?: string;
}

/** Inclusive date range covering the last `days` days, ending today (UTC) */
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

export function fetchAdsSummary(platform: AdsPlatform, days: number, brandId?: string | null) {
    return getJson<AdsSummary>(`/api/v2/analytics/summary?${buildParams(days, brandId, { sourceType: platform })}`);
}

export function fetchAdsTimeseries(platform: AdsPlatform, days: number, brandId?: string | null) {
    return getJson<{ series: TimeseriesPoint[] }>(`/api/v2/analytics/timeseries?${buildParams(days, brandId, { sourceType: platform })}`);
}

export function fetchCampaignBreakdown(platform: AdsPlatform, days: number, brandId?: string | null) {
    return getJson<{ entities: BreakdownEntity[] }>(
        `/api/v2/analytics/breakdown?${buildParams(days, brandId, { sourceType: platform, entityType: 'campaign' })}`,
    );
}

export function fetchAdAccounts(brandId?: string | null) {
    const params = new URLSearchParams();
    if (brandId) params.set('brandId', brandId);
    return getJson<{ accounts: AdAccountDto[] }>(`/api/v2/ads/accounts?${params}`);
}

/* ── formatters ─────────────────────────────────────────────────────── */

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

export function fmtPct(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return '—';
    return `${(value * 100).toFixed(2)}%`;
}
