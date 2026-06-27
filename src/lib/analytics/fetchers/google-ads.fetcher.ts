/**
 * Google Ads fetcher — account, campaign, ad-group, and ad level daily
 * metrics via GAQL over the REST googleAds:search endpoint.
 */
import { getFreshAdAccountToken } from '@/lib/ads/token-refresh';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { GOOGLE_ADS_API_BASE, GOOGLE_ADS_DEVELOPER_TOKEN } from '@/lib/ads/google-ads-oauth';
import type { MetricsEntityType } from '@/lib/db/models/metrics-snapshot.model';
import { AnalyticsFetcher, FetchWindow, MetricRow, toMetricNumber } from './types';

type GoogleLevel = 'account' | 'campaign' | 'adset' | 'ad';

interface GoogleAdsSearchRow {
    segments?: { date?: string };
    metrics?: {
        costMicros?: string | number;
        impressions?: string | number;
        clicks?: string | number;
        conversions?: number;
        conversionsValue?: number;
    };
    campaign?: { id?: string | number; name?: string };
    adGroup?: { id?: string | number; name?: string };
    adGroupAd?: { ad?: { id?: string | number; name?: string } };
}

interface GoogleAdsSearchResponse {
    results?: GoogleAdsSearchRow[];
    nextPageToken?: string;
}

const METRIC_SELECT = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value';

function buildQuery(level: GoogleLevel, window: FetchWindow): string {
    const range = `segments.date BETWEEN '${window.dateFrom}' AND '${window.dateTo}'`;
    switch (level) {
        case 'campaign':
            return `SELECT segments.date, campaign.id, campaign.name, ${METRIC_SELECT} FROM campaign WHERE ${range}`;
        case 'adset':
            return `SELECT segments.date, campaign.id, ad_group.id, ad_group.name, ${METRIC_SELECT} FROM ad_group WHERE ${range}`;
        case 'ad':
            return `SELECT segments.date, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ${METRIC_SELECT} FROM ad_group_ad WHERE ${range}`;
        default:
            return `SELECT segments.date, ${METRIC_SELECT} FROM customer WHERE ${range}`;
    }
}

async function searchLevel(
    accessToken: string,
    customerId: string,
    loginCustomerId: string | undefined,
    level: GoogleLevel,
    window: FetchWindow,
): Promise<GoogleAdsSearchRow[]> {
    if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
        throw new Error('Google Ads is not configured. Missing GOOGLE_ADS_DEVELOPER_TOKEN.');
    }

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
    };
    if (loginCustomerId) {
        headers['login-customer-id'] = loginCustomerId;
    }

    const rows: GoogleAdsSearchRow[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
        const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: buildQuery(level, window),
                ...(pageToken ? { pageToken } : {}),
            }),
        });

        if (!response.ok) {
            throw new Error(`Google Ads search failed (level=${level}): ${await response.text()}`);
        }

        const body: GoogleAdsSearchResponse = await response.json();
        rows.push(...(body.results || []));
        pageToken = body.nextPageToken;
        pages += 1;
    } while (pageToken && pages < 40);

    return rows;
}

const LEVEL_ENTITY: Record<GoogleLevel, MetricsEntityType> = {
    account: 'account',
    campaign: 'campaign',
    adset: 'adset',
    ad: 'ad',
};

function rowEntity(level: GoogleLevel, row: GoogleAdsSearchRow, externalAccountId: string): {
    entityId: string;
    entityName?: string;
    parentEntityId?: string;
} {
    switch (level) {
        case 'campaign':
            return {
                entityId: String(row.campaign?.id ?? 'unknown'),
                entityName: row.campaign?.name,
                parentEntityId: externalAccountId,
            };
        case 'adset':
            return {
                entityId: String(row.adGroup?.id ?? 'unknown'),
                entityName: row.adGroup?.name,
                parentEntityId: row.campaign?.id !== undefined ? String(row.campaign.id) : undefined,
            };
        case 'ad':
            return {
                entityId: String(row.adGroupAd?.ad?.id ?? 'unknown'),
                entityName: row.adGroupAd?.ad?.name || undefined,
                parentEntityId: row.adGroup?.id !== undefined ? String(row.adGroup.id) : undefined,
            };
        default:
            return { entityId: externalAccountId };
    }
}

export const googleAdsFetcher: AnalyticsFetcher = {
    sourceType: 'google_ads',
    connectionKind: 'ad_account',

    async fetch(connectionId: string, window: FetchWindow): Promise<MetricRow[]> {
        const { accessToken, account } = await getFreshAdAccountToken(connectionId);
        const loginCustomerId = account.googleMetadata?.loginCustomerId;
        const metricRows: MetricRow[] = [];

        try {
            for (const level of ['account', 'campaign', 'adset', 'ad'] as GoogleLevel[]) {
                const searchRows = await searchLevel(
                    accessToken,
                    account.externalAccountId,
                    loginCustomerId,
                    level,
                    window,
                );

                for (const row of searchRows) {
                    const date = row.segments?.date;
                    if (!date) continue;
                    const entity = rowEntity(level, row, account.externalAccountId);

                    metricRows.push({
                        brandId: account.brandId,
                        sourceType: 'google_ads',
                        sourceId: connectionId,
                        entityType: LEVEL_ENTITY[level],
                        entityId: entity.entityId,
                        entityName: entity.entityName ?? (level === 'account' ? account.accountName : undefined),
                        parentEntityId: entity.parentEntityId,
                        date,
                        metrics: {
                            spend: toMetricNumber(row.metrics?.costMicros) / 1_000_000,
                            impressions: toMetricNumber(row.metrics?.impressions),
                            clicks: toMetricNumber(row.metrics?.clicks),
                            conversions: toMetricNumber(row.metrics?.conversions),
                            conversion_value: toMetricNumber(row.metrics?.conversionsValue),
                        },
                    });
                }
            }

            await adAccountRepository.markSynced(connectionId);
            return metricRows;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Google Ads sync failed';
            await adAccountRepository.recordError(connectionId, message);
            throw error;
        }
    },
};

export default googleAdsFetcher;
