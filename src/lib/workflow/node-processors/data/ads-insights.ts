/**
 * Ads Insights processor — READ-ONLY.
 *
 * Pulls campaign/account metrics for the workflow's organization from the
 * unified metrics store (metrics_snapshots, kept fresh by the
 * source-metrics-sync cron). No platform API calls, no tokens, and — per
 * the ads write guardrail — nothing here ever mutates a campaign.
 *
 * Config:
 *   platform?:  'all' | 'meta_ads' | 'google_ads'   (default 'all')
 *   entityType?: 'account' | 'campaign'             (default 'campaign')
 *   days?: number                                    (1–90, default 30)
 *   brandId?: string  — optional brand-scope override. Validated against the
 *                       run's org; defaults to the workflow's brand. When no
 *                       brand is resolvable anywhere the read stays org-wide
 *                       and the output flags `brandScoped: false`.
 *
 * Output:
 *   { dateFrom, dateTo, totals: {spend, impressions, clicks, conversions},
 *     entities: [{ name, platform, spend, impressions, clicks, conversions }],
 *     brandScoped: boolean, summary: string }   — `summary` is a compact text
 *     block for AI nodes.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { lastNDaysWindow } from '@/lib/analytics/fetchers';
import type { MetricsSourceType } from '@/lib/db/models/metrics-snapshot.model';

/**
 * Resolve the brand a metrics read should be scoped to. Order:
 *   1. `config.brandId` override — only honored when it belongs to `organizationId`.
 *   2. the workflow's own `brandId`.
 *   3. none → org-wide read (caller flags brandScoped: false).
 * Shared by the ads_insights + marketing_analytics nodes so both scope identically.
 */
export async function resolveNodeBrandId(
  configBrandId: unknown,
  workflowBrandId: unknown
): Promise<string | undefined> {
  const override = configBrandId ? String(configBrandId).trim() : '';
  if (override) {
    const brand = await brandRepository.findById(override);
    if (!brand) {
      throw new Error('Ads Insights: configured brand does not belong to this organization');
    }
    return override;
  }
  const wfBrand = workflowBrandId ? String(workflowBrandId).trim() : '';
  return wfBrand || undefined;
}

const ADS_SOURCE_TYPES: MetricsSourceType[] = ['meta_ads', 'google_ads'];

export class AdsInsightsProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, workflow } = context;

    // Tenant scope comes from the workflow record — never from node config.
    const platformRaw = String(config.platform || 'all');
    const sourceType: MetricsSourceType[] =
      platformRaw === 'meta_ads' || platformRaw === 'google_ads'
        ? [platformRaw]
        : ADS_SOURCE_TYPES;

    const entityType = config.entityType === 'account' ? 'account' : 'campaign';
    const days = Math.max(1, Math.min(Number(config.days) || 30, 90));
    const window = lastNDaysWindow(days);

    // Brand scope: config override (validated) → workflow brand → org-wide.
    const brandId = await resolveNodeBrandId(config.brandId, workflow.brandId);

    const rows = await metricsSnapshotRepository.aggregateByEntity({
      brandId,
      sourceType,
      entityType,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
    });

    const entities = rows
      .map((row) => ({
        name: row.entityName || row.entityId,
        platform: row.sourceType === 'meta_ads' ? 'Meta' : 'Google',
        spend: Math.round((row.metrics.spend || 0) * 100) / 100,
        impressions: row.metrics.impressions || 0,
        clicks: row.metrics.clicks || 0,
        conversions: row.metrics.conversions || 0,
      }))
      .sort((a, b) => b.spend - a.spend);

    const totals = entities.reduce(
      (acc, entity) => ({
        spend: Math.round((acc.spend + entity.spend) * 100) / 100,
        impressions: acc.impressions + entity.impressions,
        clicks: acc.clicks + entity.clicks,
        conversions: acc.conversions + entity.conversions,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
    );

    const summaryLines = entities.slice(0, 15).map((entity) => {
      const ctr = entity.impressions > 0 ? ((entity.clicks / entity.impressions) * 100).toFixed(2) : '0';
      return `${entity.name} [${entity.platform}]: spend ${entity.spend}, impressions ${entity.impressions}, clicks ${entity.clicks} (CTR ${ctr}%), conversions ${entity.conversions}`;
    });
    const summary = entities.length === 0
      ? `No ads ${entityType} data for ${window.dateFrom} → ${window.dateTo}.`
      : `Ads performance ${window.dateFrom} → ${window.dateTo} (${entityType} level):\nTotal: spend ${totals.spend}, impressions ${totals.impressions}, clicks ${totals.clicks}, conversions ${totals.conversions}\n${summaryLines.join('\n')}`;

    return {
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      totals,
      entities,
      brandScoped: Boolean(brandId),
      summary,
      content: summary, // standard hand-off field for downstream text/AI nodes
    };
  }
}
