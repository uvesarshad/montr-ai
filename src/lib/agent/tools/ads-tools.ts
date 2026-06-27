/**
 * Ads & Analytics agent tools — READ-ONLY.
 *
 * Expose the unified metrics store (ads, GA4, Search Console) and captured
 * ad leads to Agent missions. Deliberately NO campaign-creation/mutation
 * tool: the ads write guardrail requires every platform write to trace to
 * an explicit user action in the wizard (docs/overview.md — Key
 * Architectural Decisions), and an autonomous agent does not qualify.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';
import { metricsSnapshotRepository } from '@/lib/db/repository/metrics-snapshot.repository';
import { adLeadRepository } from '@/lib/db/repository/ad-lead.repository';
import { lastNDaysWindow } from '@/lib/analytics/fetchers';
import type { MetricsSourceType } from '@/lib/db/models/metrics-snapshot.model';

function clampDays(days: number | undefined, fallback: number): number {
    return Math.max(1, Math.min(Number(days) || fallback, 90));
}

/* ── get_ads_insights ─────────────────────────────────────────────────── */

const adsInsightsParams = z.object({
    platform: z.enum(['all', 'meta_ads', 'google_ads']).optional()
        .describe('Which ad platform to read. Default: all.'),
    entityType: z.enum(['campaign', 'account']).optional()
        .describe('Aggregation level. Default: campaign.'),
    days: z.number().optional().describe('Look-back window in days (1-90). Default: 30.'),
});

const getAdsInsightsTool = {
    name: 'get_ads_insights',
    description: 'Read paid-ads performance (spend, impressions, clicks, conversions) per campaign or account from the synced metrics store. Read-only — campaigns can never be modified from here.',
    parameters: adsInsightsParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'Read paid-ads performance from connected Google/Meta ad accounts.',
        parameters: adsInsightsParams,
        execute: async (args) => {
            try {
                const sourceType: MetricsSourceType[] =
                    args.platform === 'meta_ads' || args.platform === 'google_ads'
                        ? [args.platform]
                        : ['meta_ads', 'google_ads'];
                const window = lastNDaysWindow(clampDays(args.days, 30));

                const rows = await metricsSnapshotRepository.aggregateByEntity({
                    brandId: context.brandId,
                    sourceType,
                    entityType: args.entityType === 'account' ? 'account' : 'campaign',
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
                    .sort((a, b) => b.spend - a.spend)
                    .slice(0, 25);

                const totals = entities.reduce(
                    (acc, entity) => ({
                        spend: Math.round((acc.spend + entity.spend) * 100) / 100,
                        impressions: acc.impressions + entity.impressions,
                        clicks: acc.clicks + entity.clicks,
                        conversions: acc.conversions + entity.conversions,
                    }),
                    { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
                );

                return {
                    success: true,
                    dateFrom: window.dateFrom,
                    dateTo: window.dateTo,
                    totals,
                    entities,
                    note: entities.length === 0
                        ? 'No ads data in this window — either no ad accounts are connected (Settings → Connections) or the first sync has not run yet.'
                        : undefined,
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

/* ── get_marketing_analytics ──────────────────────────────────────────── */

const marketingAnalyticsParams = z.object({
    source: z.enum(['ga4', 'search_console', 'social']).describe(
        'ga4 = website traffic, search_console = organic search, social = account-level social profiles.'),
    days: z.number().optional().describe('Look-back window in days (1-90). Default: 30.'),
});

const SOCIAL_SOURCES: MetricsSourceType[] = ['facebook', 'instagram', 'threads', 'youtube', 'linkedin', 'tiktok', 'x'];

const getMarketingAnalyticsTool = {
    name: 'get_marketing_analytics',
    description: 'Read website traffic (GA4), organic search performance (Search Console), or account-level social metrics from the synced metrics store. Read-only.',
    parameters: marketingAnalyticsParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'Read GA4 / Search Console / social account analytics.',
        parameters: marketingAnalyticsParams,
        execute: async (args) => {
            try {
                const window = lastNDaysWindow(clampDays(args.days, 30));
                const base = {
                    brandId: context.brandId,
                    dateFrom: window.dateFrom,
                    dateTo: window.dateTo,
                };

                if (args.source === 'social') {
                    const rows = await metricsSnapshotRepository.aggregateByEntity({
                        ...base,
                        sourceType: SOCIAL_SOURCES,
                        entityType: ['account', 'page', 'channel'],
                    });
                    return {
                        success: true,
                        dateFrom: window.dateFrom,
                        dateTo: window.dateTo,
                        accounts: rows.map((row) => ({
                            platform: row.sourceType,
                            name: row.entityName || row.entityId,
                            metrics: row.metrics,
                        })),
                    };
                }

                const sourceType: MetricsSourceType = args.source;
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
                // GSC position is an average — replace the meaningless sum
                if (sourceType === 'search_console' && series.length > 0 && totals.position !== undefined) {
                    totals.position = Math.round((totals.position / series.length) * 10) / 10;
                }

                return {
                    success: true,
                    dateFrom: window.dateFrom,
                    dateTo: window.dateTo,
                    totals,
                    [sourceType === 'ga4' ? 'channels' : 'topQueries']: breakdown
                        .sort((a, b) => ((b.metrics.sessions || b.metrics.clicks || 0) - (a.metrics.sessions || a.metrics.clicks || 0)))
                        .slice(0, 15)
                        .map((row) => ({ name: row.entityName || row.entityId, metrics: row.metrics })),
                    note: series.length === 0
                        ? `No ${args.source} data in this window — connect the source in Analytics → Sources.`
                        : undefined,
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

/* ── get_ad_leads ─────────────────────────────────────────────────────── */

const adLeadsParams = z.object({
    status: z.enum(['received', 'synced', 'failed', 'skipped']).optional()
        .describe('Filter by CRM sync status. Omit for all.'),
    limit: z.number().optional().describe('Max leads to return. Default: 25.'),
});

const getAdLeadsTool = {
    name: 'get_ad_leads',
    description: 'List leads captured from Meta Lead Ads / Google lead forms with their CRM sync status. Read-only.',
    parameters: adLeadsParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'List captured ad leads and their CRM sync status.',
        parameters: adLeadsParams,
        execute: async (args) => {
            try {
                const { leads, total } = await adLeadRepository.list({
                    brandId: context.brandId,
                    status: args.status,
                    limit: Math.min(Number(args.limit) || 25, 100),
                });
                const statusCounts = await adLeadRepository.countByStatus();

                return {
                    success: true,
                    total,
                    statusCounts,
                    leads: leads.map((lead) => ({
                        platform: lead.platform,
                        campaignName: lead.campaignName,
                        name: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || undefined,
                        email: lead.email,
                        phone: lead.phone,
                        status: lead.status,
                        error: lead.error,
                        contactId: lead.contactId,
                        receivedAt: lead.receivedAt,
                    })),
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(getAdsInsightsTool);
toolRegistry.register(getMarketingAnalyticsTool);
toolRegistry.register(getAdLeadsTool);
