/**
 * Meta Ads Insights fetcher — account, campaign, adset, and ad level
 * daily metrics via /act_{id}/insights (time_increment=1).
 */
import { getFreshAdAccountToken } from '@/lib/ads/token-refresh';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { META_ADS_GRAPH_BASE } from '@/lib/ads/meta-ads-oauth';
import type { MetricsEntityType } from '@/lib/db/models/metrics-snapshot.model';
import { AnalyticsFetcher, FetchWindow, MetricRow, toMetricNumber } from './types';

interface MetaAction {
    action_type?: string;
    value?: string;
}

interface MetaInsightRow {
    date_start?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    reach?: string;
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
    ad_id?: string;
    ad_name?: string;
    actions?: MetaAction[];
    action_values?: MetaAction[];
}

interface MetaInsightsResponse {
    data?: MetaInsightRow[];
    paging?: { next?: string };
}

type MetaLevel = 'account' | 'campaign' | 'adset' | 'ad';

const LEVEL_FIELDS: Record<MetaLevel, string> = {
    account: 'spend,impressions,clicks,reach,actions,action_values',
    campaign: 'campaign_id,campaign_name,spend,impressions,clicks,reach,actions,action_values',
    adset: 'campaign_id,adset_id,adset_name,spend,impressions,clicks,reach,actions,action_values',
    ad: 'adset_id,ad_id,ad_name,spend,impressions,clicks,reach,actions,action_values',
};

const LEVEL_ENTITY: Record<MetaLevel, MetricsEntityType> = {
    account: 'account',
    campaign: 'campaign',
    adset: 'adset',
    ad: 'ad',
};

/** Count lead/purchase-style conversions out of the actions array */
function extractConversions(actions?: MetaAction[]): number {
    if (!actions) return 0;
    return actions
        .filter((action) => {
            const type = action.action_type || '';
            return type.includes('lead') || type.includes('purchase') || type === 'complete_registration';
        })
        .reduce((sum, action) => sum + toMetricNumber(action.value), 0);
}

/** Purchase value out of action_values */
function extractConversionValue(actionValues?: MetaAction[]): number {
    if (!actionValues) return 0;
    return actionValues
        .filter((action) => (action.action_type || '').includes('purchase'))
        .reduce((sum, action) => sum + toMetricNumber(action.value), 0);
}

async function fetchLevel(
    accessToken: string,
    externalAccountId: string,
    level: MetaLevel,
    window: FetchWindow,
): Promise<MetaInsightRow[]> {
    const rows: MetaInsightRow[] = [];

    const firstUrl = new URL(`${META_ADS_GRAPH_BASE}/act_${externalAccountId}/insights`);
    firstUrl.searchParams.set('level', level);
    firstUrl.searchParams.set('fields', LEVEL_FIELDS[level]);
    firstUrl.searchParams.set('time_increment', '1'); // daily rows
    firstUrl.searchParams.set('time_range', JSON.stringify({ since: window.dateFrom, until: window.dateTo }));
    firstUrl.searchParams.set('limit', '500');
    firstUrl.searchParams.set('access_token', accessToken);

    let nextUrl: string | undefined = firstUrl.toString();
    let pages = 0;

    while (nextUrl && pages < 40) {
        const response = await fetch(nextUrl);
        if (!response.ok) {
            throw new Error(`Meta Ads insights fetch failed (level=${level}): ${await response.text()}`);
        }
        const body: MetaInsightsResponse = await response.json();
        rows.push(...(body.data || []));
        nextUrl = body.paging?.next;
        pages += 1;
    }

    return rows;
}

function rowEntity(level: MetaLevel, row: MetaInsightRow, externalAccountId: string): {
    entityId: string;
    entityName?: string;
    parentEntityId?: string;
} {
    switch (level) {
        case 'campaign':
            return { entityId: row.campaign_id || 'unknown', entityName: row.campaign_name, parentEntityId: externalAccountId };
        case 'adset':
            return { entityId: row.adset_id || 'unknown', entityName: row.adset_name, parentEntityId: row.campaign_id };
        case 'ad':
            return { entityId: row.ad_id || 'unknown', entityName: row.ad_name, parentEntityId: row.adset_id };
        default:
            return { entityId: externalAccountId };
    }
}

export const metaAdsFetcher: AnalyticsFetcher = {
    sourceType: 'meta_ads',
    connectionKind: 'ad_account',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const { accessToken, account } = await getFreshAdAccountToken(connectionId);
        const metricRows: MetricRow[] = [];

        try {
            for (const level of ['account', 'campaign', 'adset', 'ad'] as MetaLevel[]) {
                const insightRows = await fetchLevel(accessToken, account.externalAccountId, level, window);

                for (const row of insightRows) {
                    if (!row.date_start) continue;
                    const entity = rowEntity(level, row, account.externalAccountId);

                    metricRows.push({
                        brandId: account.brandId,
                        sourceType: 'meta_ads',
                        sourceId: connectionId,
                        entityType: LEVEL_ENTITY[level],
                        entityId: entity.entityId,
                        entityName: entity.entityName ?? (level === 'account' ? account.accountName : undefined),
                        parentEntityId: entity.parentEntityId,
                        date: row.date_start,
                        metrics: {
                            spend: toMetricNumber(row.spend),
                            impressions: toMetricNumber(row.impressions),
                            clicks: toMetricNumber(row.clicks),
                            reach: toMetricNumber(row.reach),
                            conversions: extractConversions(row.actions),
                            conversion_value: extractConversionValue(row.action_values),
                        },
                    });
                }
            }

            await adAccountRepository.markSynced(connectionId);
            return metricRows;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Meta Ads sync failed';
            await adAccountRepository.recordError(connectionId, message);
            throw error;
        }
    },
};

export default metaAdsFetcher;
