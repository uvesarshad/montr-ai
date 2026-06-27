/**
 * Meta Marketing API write-ops — create-only, always PAUSED.
 * See types.ts for the guardrail contract.
 */
import { META_ADS_GRAPH_BASE } from '@/lib/ads/meta-ads-oauth';
import { audited, WriteContext } from './types';

export interface MetaCampaignSpec {
    name: string;
    /** Wizard supports traffic + leads + awareness for now */
    objective: 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'OUTCOME_AWARENESS';
}

export interface MetaAdSetSpec {
    name: string;
    /** Daily budget in the account currency's MAJOR units (converted to minor here) */
    dailyBudget: number;
    countries: string[];   // ISO-3166-1 alpha-2
    ageMin?: number;       // >= 18
    ageMax?: number;       // <= 65
}

export interface MetaAdSpec {
    name: string;
    pageId: string;        // Connected Facebook Page that fronts the ad
    primaryText: string;   // link_data.message
    headline?: string;     // link_data.name
    description?: string;  // link_data.description
    linkUrl: string;
    imageUrl?: string;     // link_data.picture
}

async function graphPost(
    path: string,
    accessToken: string,
    body: Record<string, string>,
): Promise<{ id: string }> {
    const response = await fetch(`${META_ADS_GRAPH_BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...body, access_token: accessToken }),
    });

    if (!response.ok) {
        throw new Error(`Meta ${path} create failed: ${await response.text()}`);
    }

    const data = await response.json();
    if (!data.id) {
        throw new Error(`Meta ${path} create returned no id: ${JSON.stringify(data)}`);
    }
    return { id: String(data.id) };
}

export async function createMetaCampaign(context: WriteContext, spec: MetaCampaignSpec): Promise<{ id: string }> {
    const actId = context.account.externalAccountId;
    return audited(context, 'create_campaign', { ...spec }, () =>
        graphPost(`act_${actId}/campaigns`, context.accessToken, {
            name: spec.name,
            objective: spec.objective,
            status: 'PAUSED', // guardrail — never created live
            special_ad_categories: '[]',
        }),
    );
}

export async function createMetaAdSet(
    context: WriteContext,
    campaignId: string,
    spec: MetaAdSetSpec,
): Promise<{ id: string }> {
    const actId = context.account.externalAccountId;
    const targeting = {
        geo_locations: { countries: spec.countries },
        age_min: spec.ageMin ?? 18,
        age_max: spec.ageMax ?? 65,
    };

    return audited(context, 'create_adset', { campaignId, ...spec }, () =>
        graphPost(`act_${actId}/adsets`, context.accessToken, {
            name: spec.name,
            campaign_id: campaignId,
            daily_budget: String(Math.round(spec.dailyBudget * 100)), // minor units
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'LINK_CLICKS',
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            targeting: JSON.stringify(targeting),
            status: 'PAUSED', // guardrail
        }),
    );
}

export async function createMetaAd(
    context: WriteContext,
    adsetId: string,
    spec: MetaAdSpec,
): Promise<{ adId: string; creativeId: string }> {
    const actId = context.account.externalAccountId;

    const linkData: Record<string, string> = {
        link: spec.linkUrl,
        message: spec.primaryText,
    };
    if (spec.headline) linkData.name = spec.headline;
    if (spec.description) linkData.description = spec.description;
    if (spec.imageUrl) linkData.picture = spec.imageUrl;

    const creative = await audited(context, 'create_ad_creative', { adsetId, ...spec }, () =>
        graphPost(`act_${actId}/adcreatives`, context.accessToken, {
            name: `${spec.name} — creative`,
            object_story_spec: JSON.stringify({
                page_id: spec.pageId,
                link_data: linkData,
            }),
        }),
    );

    const ad = await audited(context, 'create_ad', { adsetId, creativeId: creative.id, name: spec.name }, () =>
        graphPost(`act_${actId}/ads`, context.accessToken, {
            name: spec.name,
            adset_id: adsetId,
            creative: JSON.stringify({ creative_id: creative.id }),
            status: 'PAUSED', // guardrail
        }),
    );

    return { adId: ad.id, creativeId: creative.id };
}
