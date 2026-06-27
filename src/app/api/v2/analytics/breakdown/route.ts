import { NextRequest, NextResponse } from 'next/server';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { resolveAnalyticsRequest, toRangeQuery } from '@/lib/analytics/api-helpers';

/**
 * Per-entity totals over a date range — campaign tables, GSC top queries,
 * GA4 channel groups, etc.
 * GET /api/v2/analytics/breakdown?entityType=campaign&sourceType=meta_ads&dateFrom=&dateTo=
 *
 * entityType is required here — mixing entity levels in one table would
 * double-count (an account row already contains its campaigns).
 */
export async function GET(req: NextRequest) {
    try {
        const resolution = await resolveAnalyticsRequest(req.url);
        if (!resolution.ok) {
            return NextResponse.json({ error: resolution.error }, { status: resolution.status });
        }

        if (!resolution.query.entityType) {
            return NextResponse.json({ error: 'entityType is required' }, { status: 400 });
        }

        const range = toRangeQuery(resolution.query);
        const entities = await metricsSnapshotRepository.aggregateByEntity(range);

        return NextResponse.json({
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            entityType: resolution.query.entityType,
            entities,
        });
    } catch (error) {
        console.error('Analytics breakdown error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
