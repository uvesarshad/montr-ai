import { NextRequest, NextResponse } from 'next/server';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { resolveAnalyticsRequest, toRangeQuery } from '@/lib/analytics/api-helpers';
import type { MetricsEntityType } from '@/lib/db/models/metrics-snapshot.model';

/** Top-level entities only — breakdown rows would double-count totals */
const TOP_LEVEL_ENTITIES: MetricsEntityType[] = ['account', 'page', 'channel', 'property', 'site'];

/**
 * Cross-source totals for a date range.
 * GET /api/v2/analytics/summary?brandId=&sourceType=&dateFrom=&dateTo=
 *
 * Returns summed metrics overall and per sourceType. Note: averages like
 * GSC `position` are summed here too — present per-source values from the
 * breakdown endpoint where exactness matters.
 */
export async function GET(req: NextRequest) {
    try {
        const resolution = await resolveAnalyticsRequest(req.url);
        if (!resolution.ok) {
            return NextResponse.json({ error: resolution.error }, { status: resolution.status });
        }

        const range = toRangeQuery(resolution.query);
        const topLevelRange = {
            ...range,
            entityType: range.entityType || TOP_LEVEL_ENTITIES,
        };

        const byEntity = await metricsSnapshotRepository.aggregateByEntity(topLevelRange);

        const totals: Record<string, number> = {};
        const bySourceType: Record<string, Record<string, number>> = {};

        for (const row of byEntity) {
            const bucket = bySourceType[row.sourceType] || (bySourceType[row.sourceType] = {});
            for (const [key, value] of Object.entries(row.metrics)) {
                totals[key] = (totals[key] || 0) + value;
                bucket[key] = (bucket[key] || 0) + value;
            }
        }

        return NextResponse.json({
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            totals,
            bySourceType,
            sources: byEntity.length,
        });
    } catch (error) {
        console.error('Analytics summary error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
