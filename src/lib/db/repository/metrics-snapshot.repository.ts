import { connectDB } from '@/lib/mongodb';
import MetricsSnapshot, {
    IMetricsSnapshot,
    MetricsEntityType,
    MetricsSourceType,
} from '@/lib/db/models/metrics-snapshot.model';

/** A single entity × day metric row produced by a fetcher */
export interface MetricRow {
    brandId: string;
    sourceType: MetricsSourceType;
    sourceId: string;
    entityType: MetricsEntityType;
    entityId: string;
    entityName?: string;
    parentEntityId?: string;
    date: string; // 'YYYY-MM-DD'
    metrics: Record<string, number>;
}

export interface MetricsRangeQuery {
    brandId?: string;
    sourceType?: MetricsSourceType | MetricsSourceType[];
    sourceId?: string;
    entityType?: MetricsEntityType | MetricsEntityType[];
    entityId?: string;
    parentEntityId?: string;
    dateFrom: string; // inclusive 'YYYY-MM-DD'
    dateTo: string;   // inclusive 'YYYY-MM-DD'
}

function buildRangeFilter(query: MetricsRangeQuery): Record<string, unknown> {
    const filter: Record<string, unknown> = {
        date: { $gte: query.dateFrom, $lte: query.dateTo },
    };
    if (query.brandId) filter.brandId = query.brandId;
    if (query.sourceType) {
        filter.sourceType = Array.isArray(query.sourceType) ? { $in: query.sourceType } : query.sourceType;
    }
    if (query.sourceId) filter.sourceId = query.sourceId;
    if (query.entityType) {
        filter.entityType = Array.isArray(query.entityType) ? { $in: query.entityType } : query.entityType;
    }
    if (query.entityId) filter.entityId = query.entityId;
    if (query.parentEntityId) filter.parentEntityId = query.parentEntityId;
    return filter;
}

/**
 * Metrics Snapshot Repository — daily time-series storage for the
 * analytics fetchers and the /api/v2/analytics query endpoints.
 */
export const metricsSnapshotRepository = {
    /**
     * Idempotent bulk upsert keyed on (sourceId, entityType, entityId, date).
     * Re-running a sync for the same window simply refreshes the rows.
     */
    async upsertMany(rows: MetricRow[]): Promise<number> {
        if (rows.length === 0) return 0;
        await connectDB();

        const result = await MetricsSnapshot.bulkWrite(
            rows.map((row) => {
                const set: Partial<IMetricsSnapshot> = {
                    brandId: row.brandId,
                    sourceType: row.sourceType,
                    metrics: row.metrics,
                };
                if (row.entityName !== undefined) set.entityName = row.entityName;
                if (row.parentEntityId !== undefined) set.parentEntityId = row.parentEntityId;

                return {
                    updateOne: {
                        filter: {
                            sourceId: row.sourceId,
                            entityType: row.entityType,
                            entityId: row.entityId,
                            date: row.date,
                        },
                        update: { $set: set },
                        upsert: true,
                    },
                };
            }),
            { ordered: false },
        );

        return (result.upsertedCount || 0) + (result.modifiedCount || 0);
    },

    /**
     * Raw rows for a date range (sorted by date ascending)
     */
    async findRange(query: MetricsRangeQuery): Promise<IMetricsSnapshot[]> {
        await connectDB();
        return await MetricsSnapshot.find(buildRangeFilter(query)).sort({ date: 1 }).lean<IMetricsSnapshot[]>();
    },

    /**
     * Sum every metric per day across the matching rows → time series
     */
    async aggregateByDate(query: MetricsRangeQuery): Promise<{ date: string; metrics: Record<string, number> }[]> {
        await connectDB();
        const rows = await MetricsSnapshot.aggregate([
            { $match: buildRangeFilter(query) },
            {
                $project: {
                    date: 1,
                    metrics: { $objectToArray: '$metrics' },
                },
            },
            { $unwind: '$metrics' },
            {
                $group: {
                    _id: { date: '$date', metric: '$metrics.k' },
                    value: { $sum: '$metrics.v' },
                },
            },
            {
                $group: {
                    _id: '$_id.date',
                    metrics: { $push: { k: '$_id.metric', v: '$value' } },
                },
            },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    metrics: { $arrayToObject: '$metrics' },
                },
            },
            { $sort: { date: 1 } },
        ]);
        return rows;
    },

    /**
     * Sum every metric per entity across the date range → breakdown table
     */
    async aggregateByEntity(query: MetricsRangeQuery): Promise<{
        entityType: string;
        entityId: string;
        entityName: string | null;
        parentEntityId: string | null;
        sourceType: string;
        sourceId: string;
        metrics: Record<string, number>;
    }[]> {
        await connectDB();
        const rows = await MetricsSnapshot.aggregate([
            { $match: buildRangeFilter(query) },
            {
                $project: {
                    sourceType: 1,
                    sourceId: 1,
                    entityType: 1,
                    entityId: 1,
                    entityName: 1,
                    parentEntityId: 1,
                    metrics: { $objectToArray: '$metrics' },
                },
            },
            { $unwind: '$metrics' },
            {
                $group: {
                    _id: {
                        sourceType: '$sourceType',
                        sourceId: '$sourceId',
                        entityType: '$entityType',
                        entityId: '$entityId',
                        metric: '$metrics.k',
                    },
                    entityName: { $last: '$entityName' },
                    parentEntityId: { $last: '$parentEntityId' },
                    value: { $sum: '$metrics.v' },
                },
            },
            {
                $group: {
                    _id: {
                        sourceType: '$_id.sourceType',
                        sourceId: '$_id.sourceId',
                        entityType: '$_id.entityType',
                        entityId: '$_id.entityId',
                    },
                    entityName: { $last: '$entityName' },
                    parentEntityId: { $last: '$parentEntityId' },
                    metrics: { $push: { k: '$_id.metric', v: '$value' } },
                },
            },
            {
                $project: {
                    _id: 0,
                    sourceType: '$_id.sourceType',
                    sourceId: '$_id.sourceId',
                    entityType: '$_id.entityType',
                    entityId: '$_id.entityId',
                    entityName: 1,
                    parentEntityId: 1,
                    metrics: { $arrayToObject: '$metrics' },
                },
            },
        ]);
        return rows;
    },

    /**
     * Latest synced date for a source (sync checkpointing)
     */
    async latestDateForSource(sourceId: string): Promise<string | null> {
        await connectDB();
        const row = await MetricsSnapshot.findOne({ sourceId }).sort({ date: -1 }).select('date').lean<{ date: string } | null>();
        return row?.date || null;
    },

    /**
     * Remove all rows for a disconnected source
     */
    async deleteBySourceId(sourceId: string): Promise<number> {
        await connectDB();
        const result = await MetricsSnapshot.deleteMany({ sourceId });
        return result.deletedCount || 0;
    },
};

export default metricsSnapshotRepository;
