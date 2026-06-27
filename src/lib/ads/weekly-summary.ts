/**
 * Weekly ads summary — computed (NOT AI-generated, so no credits burned)
 * week-over-week spend/clicks/conversions per organization with active ad
 * accounts, published as a domain event the notification dispatcher turns
 * into an admin notification. Runs from the source-metrics worker cron.
 */
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { publishDomainEvent } from '@/lib/events/domain-bus';
import { dispatchTrigger } from '@/lib/workflow/triggers/dispatch';
import { toDateKey } from '@/lib/analytics/fetchers';

// WoW spend swing (absolute %) above which the weekly run also fires the
// pacing/anomaly triggers so "alert the team when pacing breaks" is automatable.
const PACING_ANOMALY_THRESHOLD_PCT = 30;

interface WeekTotals {
    spend: number;
    clicks: number;
    conversions: number;
}

async function weekTotals(daysAgoStart: number, daysAgoEnd: number): Promise<WeekTotals> {
    const day = 24 * 60 * 60 * 1000;
    const rows = await metricsSnapshotRepository.aggregateByEntity({
        sourceType: ['meta_ads', 'google_ads'],
        entityType: 'account',
        dateFrom: toDateKey(new Date(Date.now() - daysAgoStart * day)),
        dateTo: toDateKey(new Date(Date.now() - daysAgoEnd * day)),
    });

    return rows.reduce<WeekTotals>(
        (acc, row) => ({
            spend: acc.spend + (row.metrics.spend || 0),
            clicks: acc.clicks + (row.metrics.clicks || 0),
            conversions: acc.conversions + (row.metrics.conversions || 0),
        }),
        { spend: 0, clicks: 0, conversions: 0 },
    );
}

/**
 * Publish one weekly summary event per org that had any ad activity in the
 * last two weeks. Returns the number of orgs notified.
 */
export async function runAdsWeeklySummary(): Promise<number> {
    const accounts = await adAccountRepository.findAllActive();
    const organizationIds = Array.from(new Set(accounts.map((account) => account.userId)));

    let published = 0;

    for (const organizationId of organizationIds) {
        try {
            const [current, previous] = await Promise.all([
                weekTotals(7, 1),
                weekTotals(14, 8),
            ]);

            // Nothing to report — skip silently
            if (current.spend === 0 && previous.spend === 0 && current.clicks === 0) continue;

            const spendDeltaPct = previous.spend > 0
                ? ((current.spend - previous.spend) / previous.spend) * 100
                : null;

            const weekKey = toDateKey(new Date());
            const summaryPayload = {
                weekKey,
                spend: Math.round(current.spend * 100) / 100,
                clicks: current.clicks,
                conversions: current.conversions,
                prevSpend: Math.round(previous.spend * 100) / 100,
                spendDeltaPct: spendDeltaPct === null ? null : Math.round(spendDeltaPct * 10) / 10,
            };

            publishDomainEvent({
                type: 'ads.weekly_summary',
                source: 'ads.weeklySummary',
                payload: summaryPayload,
            });
            published += 1;

            // Fire workflow triggers alongside the admin notification so the
            // signal is automatable ("alert the team when pacing breaks").
            // Non-blocking — a dispatch failure must not abort the cron loop.
            // eventId = org+week so a cron re-run dedups to one execution.
            try {
                await dispatchTrigger({
                    kind: 'ads_performance',
                    subKind: 'ads_weekly_summary',
                    eventId: `${organizationId}:${weekKey}`,
                    metrics: summaryPayload,
                });

                // Pacing/anomaly: large WoW spend swing → fire both the budget
                // threshold and anomaly triggers so either pattern is buildable.
                if (spendDeltaPct !== null && Math.abs(spendDeltaPct) >= PACING_ANOMALY_THRESHOLD_PCT) {
                    const anomalyMetrics = {
                        ...summaryPayload,
                        thresholdPct: PACING_ANOMALY_THRESHOLD_PCT,
                        direction: spendDeltaPct >= 0 ? 'up' : 'down',
                    };
                    await dispatchTrigger({
                        kind: 'ads_performance',
                        subKind: 'ads_budget_threshold',
                        eventId: `${organizationId}:${weekKey}:budget`,
                        metrics: anomalyMetrics,
                    });
                    await dispatchTrigger({
                        kind: 'ads_performance',
                        subKind: 'ads_performance_anomaly',
                        eventId: `${organizationId}:${weekKey}:anomaly`,
                        metrics: anomalyMetrics,
                    });
                }
            } catch (dispatchError) {
                console.error(`[Ads Weekly] Trigger dispatch failed for org ${organizationId}:`, dispatchError);
            }
        } catch (error) {
            console.error(`[Ads Weekly] Summary failed for org ${organizationId}:`, error);
        }
    }

    return published;
}
