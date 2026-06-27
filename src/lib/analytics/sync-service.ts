/**
 * Source metrics sync service — drives the analytics fetchers over every
 * connected source and upserts the resulting daily rows.
 *
 * Read-only with respect to the platforms: fetchers never mutate anything
 * remote (hard guardrail — see docs/ads-analytics-plan.md).
 */
import { connectDB } from '@/lib/mongodb';
import SocialAccount from '@/lib/db/models/social-account.model';
import type { MetricsSourceType } from '@/lib/db/models/metrics-snapshot.model';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { analyticsFetchers, getAnalyticsFetcher, lastNDaysWindow, FetchWindow } from '@/lib/analytics/fetchers';

/** Default look-back for the recurring sync: re-pull a few days so
 *  late-arriving attribution data (ads conversions) settles. */
export const DEFAULT_SYNC_DAYS = 3;
/** Look-back for the initial backfill after connecting a source. */
export const BACKFILL_DAYS = 90;

export interface SyncTarget {
    sourceType: MetricsSourceType;
    connectionId: string;
}

export interface SyncResult {
    target: SyncTarget;
    ok: boolean;
    rows: number;
    error?: string;
}

/** Social platforms that have an account-level fetcher registered */
const SOCIAL_SOURCE_TYPES: MetricsSourceType[] = ['youtube', 'facebook', 'instagram', 'threads', 'linkedin', 'tiktok', 'x'];

/**
 * Sync one connection over a window. Errors are captured per target (the
 * fetchers already record them on the connection document).
 */
export async function syncOneSource(target: SyncTarget, window?: FetchWindow): Promise<SyncResult> {
    const fetcher = getAnalyticsFetcher(target.sourceType);
    if (!fetcher) {
        return { target, ok: false, rows: 0, error: `No fetcher registered for ${target.sourceType}` };
    }

    const effectiveWindow = window || lastNDaysWindow(DEFAULT_SYNC_DAYS);

    try {
        const rows = await fetcher.fetch(target.connectionId, effectiveWindow);
        const written = await metricsSnapshotRepository.upsertMany(rows);
        return { target, ok: true, rows: written };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'sync failed';
        console.error(`[Metrics Sync] ${target.sourceType}/${target.connectionId} failed:`, message);
        return { target, ok: false, rows: 0, error: message };
    }
}

/**
 * Enumerate every active connection that has a registered fetcher.
 */
export async function listSyncTargets(): Promise<SyncTarget[]> {
    const targets: SyncTarget[] = [];

    const adAccounts = await adAccountRepository.findAllActive();
    for (const account of adAccounts) {
        if (analyticsFetchers[account.platform]) {
            targets.push({ sourceType: account.platform, connectionId: account._id.toString() });
        }
    }

    const sources = await analyticsSourceRepository.findAllActive();
    for (const source of sources) {
        if (analyticsFetchers[source.sourceType]) {
            targets.push({ sourceType: source.sourceType, connectionId: source._id.toString() });
        }
    }

    await connectDB();
    const socialAccounts = await SocialAccount.find({
        isActive: true,
        platform: { $in: SOCIAL_SOURCE_TYPES },
    }).select('_id platform');
    for (const account of socialAccounts) {
        targets.push({
            sourceType: account.platform as MetricsSourceType,
            connectionId: account._id.toString(),
        });
    }

    return targets;
}

/**
 * Sync every connected source. Targets run sequentially — a single worker
 * process; per-platform API rate limits matter more than wall-clock here.
 */
export async function syncAllSources(days: number = DEFAULT_SYNC_DAYS): Promise<{
    targets: number;
    succeeded: number;
    failed: number;
    rows: number;
}> {
    const window = lastNDaysWindow(days);
    const targets = await listSyncTargets();

    let succeeded = 0;
    let failed = 0;
    let rows = 0;

    for (const target of targets) {
        const result = await syncOneSource(target, window);
        if (result.ok) {
            succeeded += 1;
            rows += result.rows;
        } else {
            failed += 1;
        }
    }

    return { targets: targets.length, succeeded, failed, rows };
}
