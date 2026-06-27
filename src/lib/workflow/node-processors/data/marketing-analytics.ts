/**
 * Marketing Analytics processor — READ-ONLY.
 *
 * Mirrors the Agent `get_marketing_analytics` tool as a workflow node: reads
 * website traffic (GA4), organic search (Search Console), or account-level
 * social metrics from the unified metrics store. No platform API calls, no
 * tokens, and nothing here ever mutates a campaign or profile.
 *
 * Config:
 *   source: 'ga4' | 'search_console' | 'social'   (required)
 *   days?: number                                   (1–90, default 30)
 *   brandId?: string  — optional brand-scope override, validated against the
 *                       run's org; defaults to the workflow's brand. No brand
 *                       anywhere → org-wide read with `brandScoped: false`.
 *
 * Output (ga4 / search_console):
 *   { source, dateFrom, dateTo, totals, channels|topQueries, brandScoped, summary, content }
 * Output (social):
 *   { source, dateFrom, dateTo, accounts: [{ platform, name, metrics }], brandScoped, summary, content }
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveNodeBrandId } from './ads-insights';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { lastNDaysWindow } from '@/lib/analytics/fetchers';
import type { MetricsSourceType } from '@/lib/db/models/metrics-snapshot.model';

const SOCIAL_SOURCES: MetricsSourceType[] = ['facebook', 'instagram', 'youtube', 'linkedin', 'tiktok', 'x'];

export class MarketingAnalyticsProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, workflow } = context;

    // Tenant scope comes from the workflow record — never from node config.
    const source = String(config.source || '');
    if (source !== 'ga4' && source !== 'search_console' && source !== 'social') {
      throw new Error("Marketing Analytics: source must be 'ga4', 'search_console', or 'social'");
    }

    const days = Math.max(1, Math.min(Number(config.days) || 30, 90));
    const window = lastNDaysWindow(days);

    // Brand scope: config override (validated) → workflow brand → org-wide.
    const brandId = await resolveNodeBrandId(config.brandId, workflow.brandId);
    const brandScoped = Boolean(brandId);

    const base = {
      brandId,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
    };

    if (source === 'social') {
      const rows = await metricsSnapshotRepository.aggregateByEntity({
        ...base,
        sourceType: SOCIAL_SOURCES,
        entityType: ['account', 'page', 'channel'],
      });
      const accounts = rows.map((row) => ({
        platform: row.sourceType,
        name: row.entityName || row.entityId,
        metrics: row.metrics,
      }));
      const summary = accounts.length === 0
        ? `No social account data for ${window.dateFrom} → ${window.dateTo}.`
        : `Social account metrics ${window.dateFrom} → ${window.dateTo}:\n${accounts
            .map((a) => `${a.name} [${a.platform}]: ${Object.entries(a.metrics).map(([k, v]) => `${k} ${v}`).join(', ')}`)
            .join('\n')}`;
      return {
        source,
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
        accounts,
        brandScoped,
        summary,
        content: summary,
      };
    }

    const sourceType: MetricsSourceType = source;
    const topLevel = sourceType === 'ga4' ? 'property' : 'site';
    const breakdownType = sourceType === 'ga4' ? 'channel_group' : 'query';

    const [series, breakdown] = await Promise.all([
      metricsSnapshotRepository.aggregateByDate({ ...base, sourceType, entityType: topLevel }),
      metricsSnapshotRepository.aggregateByEntity({ ...base, sourceType, entityType: breakdownType }),
    ]);

    const totals: Record<string, number> = {};
    for (const point of series) {
      for (const [key, value] of Object.entries(point.metrics)) {
        totals[key] = (totals[key] || 0) + value;
      }
    }
    // GSC position is an average — replace the meaningless sum.
    if (sourceType === 'search_console' && series.length > 0 && totals.position !== undefined) {
      totals.position = Math.round((totals.position / series.length) * 10) / 10;
    }

    const breakdownRows = breakdown
      .sort((a, b) => ((b.metrics.sessions || b.metrics.clicks || 0) - (a.metrics.sessions || a.metrics.clicks || 0)))
      .slice(0, 15)
      .map((row) => ({ name: row.entityName || row.entityId, metrics: row.metrics }));

    const breakdownKey = sourceType === 'ga4' ? 'channels' : 'topQueries';
    const summary = series.length === 0
      ? `No ${source} data for ${window.dateFrom} → ${window.dateTo}.`
      : `${source} ${window.dateFrom} → ${window.dateTo}:\nTotals: ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(', ')}\n${breakdownRows
          .map((r) => `${r.name}: ${Object.entries(r.metrics).map(([k, v]) => `${k} ${v}`).join(', ')}`)
          .join('\n')}`;

    return {
      source,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      totals,
      [breakdownKey]: breakdownRows,
      brandScoped,
      summary,
      content: summary,
    };
  }
}
