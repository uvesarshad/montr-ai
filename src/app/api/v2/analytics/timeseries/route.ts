import { NextRequest, NextResponse } from 'next/server';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { resolveAnalyticsRequest, toRangeQuery } from '@/lib/analytics/api-helpers';
import type { MetricsEntityType } from '@/lib/db/models/metrics-snapshot.model';

/** Default to top-level entities so breakdown rows don't double-count */
const TOP_LEVEL_ENTITIES: MetricsEntityType[] = ['account', 'page', 'channel', 'property', 'site'];

/**
 * Daily time series (metrics summed per day across matching rows).
 * GET /api/v2/analytics/timeseries?brandId=&sourceType=&entityType=&entityId=&dateFrom=&dateTo=
 */
export async function GET(req: NextRequest) {
    try {
        const resolution = await resolveAnalyticsRequest(req.url);
        if (!resolution.ok) {
            return NextResponse.json({ error: resolution.error }, { status: resolution.status });
        }

        const range = toRangeQuery(resolution.query);
        const series = await metricsSnapshotRepository.aggregateByDate({
            ...range,
            entityType: range.entityType || TOP_LEVEL_ENTITIES,
        });

        return NextResponse.json({
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            series,
        });
    } catch (error) {
        console.error('Analytics timeseries error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
