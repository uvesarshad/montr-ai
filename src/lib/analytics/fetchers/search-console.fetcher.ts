/**
 * Search Console fetcher — site-level daily search performance plus
 * query and page breakdowns via searchAnalytics.query.
 *
 * Note: `position` is an average, not additive — it is stored on the rows
 * as reported and must be presented as an average, never summed.
 */
import { getFreshAnalyticsSourceToken } from '@/lib/ads/token-refresh';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';
import { SEARCH_CONSOLE_API_BASE } from '@/lib/analytics/analytics-oauth';
import type { MetricsEntityType } from '@/lib/db/models/metrics-snapshot.model';
import { AnalyticsFetcher, FetchWindow, MetricRow, toMetricNumber } from './types';

interface GscRow {
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
}

interface GscResponse {
    rows?: GscRow[];
}

interface BreakdownSpec {
    dimension: 'query' | 'page' | null; // null = site-level (date only)
    entityType: MetricsEntityType;
    rowLimit: number;
}

const REPORTS: BreakdownSpec[] = [
    { dimension: null, entityType: 'site', rowLimit: 5000 },
    { dimension: 'query', entityType: 'query', rowLimit: 5000 },
    { dimension: 'page', entityType: 'page_path', rowLimit: 5000 },
];

async function queryReport(
    accessToken: string,
    siteUrl: string,
    spec: BreakdownSpec,
    window: FetchWindow,
): Promise<GscRow[]> {
    const endpoint = `${SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            startDate: window.dateFrom,
            endDate: window.dateTo,
            dimensions: ['date', ...(spec.dimension ? [spec.dimension] : [])],
            rowLimit: spec.rowLimit,
        }),
    });

    if (!response.ok) {
        throw new Error(`Search Console query failed (${spec.dimension || 'site'}): ${await response.text()}`);
    }

    const body: GscResponse = await response.json();
    return body.rows || [];
}

export const searchConsoleFetcher: AnalyticsFetcher = {
    sourceType: 'search_console',
    connectionKind: 'analytics_source',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const { accessToken, source } = await getFreshAnalyticsSourceToken(connectionId);
        const metricRows: MetricRow[] = [];

        try {
            for (const spec of REPORTS) {
                const rows = await queryReport(accessToken, source.externalId, spec, window);

                for (const row of rows) {
                    const date = row.keys?.[0];
                    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

                    const breakdownValue = spec.dimension ? (row.keys?.[1] || '(not set)') : null;

                    metricRows.push({
                        brandId: source.brandId,
                        sourceType: 'search_console',
                        sourceId: connectionId,
                        entityType: spec.entityType,
                        entityId: breakdownValue ?? source.externalId,
                        entityName: breakdownValue ?? source.displayName,
                        parentEntityId: breakdownValue ? source.externalId : undefined,
                        date,
                        metrics: {
                            clicks: toMetricNumber(row.clicks),
                            impressions: toMetricNumber(row.impressions),
                            position: toMetricNumber(row.position), // average — do not sum
                        },
                    });
                }
            }

            await analyticsSourceRepository.markSynced(connectionId);
            return metricRows;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Search Console sync failed';
            await analyticsSourceRepository.recordError(connectionId, message);
            throw error;
        }
    },
};

export default searchConsoleFetcher;
