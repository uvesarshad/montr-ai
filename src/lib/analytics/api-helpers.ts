/**
 * Shared request plumbing for the /api/v2/analytics read endpoints.
 */
import { getSession } from '@/lib/get-session';
import { analyticsRangeQuerySchema, AnalyticsRangeQuery } from '@/validations/analytics';
import type { MetricsRangeQuery } from '@/lib/db/repository/metrics-snapshot.repository';
import { lastNDaysWindow } from '@/lib/analytics/fetchers';

export type AnalyticsRequestResolution =
    | { ok: true;
 userId: string; query: AnalyticsRangeQuery }
    | { ok: false; status: number; error: string };

/**
 * Authenticates, resolves the organization from the session user's DB
 * record (never client-supplied), and validates the query string.
 */
export async function resolveAnalyticsRequest(url: string): Promise<AnalyticsRequestResolution> {
    const session = await getSession();
    if (!session?.user?.id) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }
    const params = Object.fromEntries(new URL(url).searchParams.entries());
    const parsed = analyticsRangeQuerySchema.safeParse(params);
    if (!parsed.success) {
        return { ok: false, status: 400, error: parsed.error.issues[0]?.message || 'Invalid query' };
    }

    return { ok: true, userId: session.user.id!, query: parsed.data };
}

/** Map the validated query onto a repository range query (default: last 30 days) */
export function toRangeQuery(query: AnalyticsRangeQuery): MetricsRangeQuery {
    const fallback = lastNDaysWindow(30);
    return {
        brandId: query.brandId,
        sourceType: query.sourceType,
        sourceId: query.sourceId,
        entityType: query.entityType,
        entityId: query.entityId,
        parentEntityId: query.parentEntityId,
        dateFrom: query.dateFrom || fallback.dateFrom,
        dateTo: query.dateTo || fallback.dateTo,
    };
}
