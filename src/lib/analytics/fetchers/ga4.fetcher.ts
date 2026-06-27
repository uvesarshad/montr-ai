/**
 * GA4 fetcher — property-level daily traffic plus channel-group and
 * landing-page breakdowns via the Analytics Data API (runReport).
 */
import { getFreshAnalyticsSourceToken } from '@/lib/ads/token-refresh';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';
import type { MetricsEntityType } from '@/lib/db/models/metrics-snapshot.model';
import { AnalyticsFetcher, FetchWindow, MetricRow, toMetricNumber } from './types';

const GA4_DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';

interface Ga4ReportRow {
    dimensionValues?: { value?: string }[];
    metricValues?: { value?: string }[];
}

interface Ga4ReportResponse {
    rows?: Ga4ReportRow[];
}

// keyEvents is the post-2024 name for conversions in the Data API
const METRICS = ['sessions', 'totalUsers', 'newUsers', 'screenPageViews', 'engagedSessions', 'keyEvents'] as const;

const METRIC_KEYS: Record<(typeof METRICS)[number], string> = {
    sessions: 'sessions',
    totalUsers: 'users',
    newUsers: 'new_users',
    screenPageViews: 'page_views',
    engagedSessions: 'engaged_sessions',
    keyEvents: 'conversions',
};

interface BreakdownSpec {
    dimension: string | null; // null = property-level (date only)
    entityType: MetricsEntityType;
    limit: number;
}

const REPORTS: BreakdownSpec[] = [
    { dimension: null, entityType: 'property', limit: 100000 },
    { dimension: 'sessionDefaultChannelGroup', entityType: 'channel_group', limit: 100000 },
    { dimension: 'landingPagePlusQueryString', entityType: 'page_path', limit: 10000 },
];

/** GA4 returns dates as YYYYMMDD */
function toDateKey(raw: string): string | null {
    if (!/^\d{8}$/.test(raw)) return null;
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

async function runReport(
    accessToken: string,
    propertyId: string,
    spec: BreakdownSpec,
    window: FetchWindow,
): Promise<Ga4ReportRow[]> {
    const dimensions = [{ name: 'date' }, ...(spec.dimension ? [{ name: spec.dimension }] : [])];

    const response = await fetch(`${GA4_DATA_API_BASE}/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            dateRanges: [{ startDate: window.dateFrom, endDate: window.dateTo }],
            dimensions,
            metrics: METRICS.map((name) => ({ name })),
            limit: spec.limit,
        }),
    });

    if (!response.ok) {
        throw new Error(`GA4 runReport failed (${spec.dimension || 'property'}): ${await response.text()}`);
    }

    const body: Ga4ReportResponse = await response.json();
    return body.rows || [];
}

export const ga4Fetcher: AnalyticsFetcher = {
    sourceType: 'ga4',
    connectionKind: 'analytics_source',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const { accessToken, source } = await getFreshAnalyticsSourceToken(connectionId);
        const metricRows: MetricRow[] = [];

        try {
            for (const spec of REPORTS) {
                const rows = await runReport(accessToken, source.externalId, spec, window);

                for (const row of rows) {
                    const date = toDateKey(row.dimensionValues?.[0]?.value || '');
                    if (!date) continue;

                    const breakdownValue = spec.dimension ? (row.dimensionValues?.[1]?.value || '(not set)') : null;
                    const metrics: Record<string, number> = {};
                    METRICS.forEach((name, index) => {
                        metrics[METRIC_KEYS[name]] = toMetricNumber(row.metricValues?.[index]?.value);
                    });

                    metricRows.push({
                        brandId: source.brandId,
                        sourceType: 'ga4',
                        sourceId: connectionId,
                        entityType: spec.entityType,
                        entityId: breakdownValue ?? source.externalId,
                        entityName: breakdownValue ?? source.displayName,
                        parentEntityId: breakdownValue ? source.externalId : undefined,
                        date,
                        metrics,
                    });
                }
            }

            await analyticsSourceRepository.markSynced(connectionId);
            return metricRows;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'GA4 sync failed';
            await analyticsSourceRepository.recordError(connectionId, message);
            throw error;
        }
    },
};

export default ga4Fetcher;
