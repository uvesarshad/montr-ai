/**
 * Google Ads REST write-ops — create-only Search campaigns, always PAUSED.
 * See types.ts for the guardrail contract.
 */
import { GOOGLE_ADS_API_BASE, GOOGLE_ADS_DEVELOPER_TOKEN } from '@/lib/ads/google-ads-oauth';
import { audited, WriteContext } from './types';

export interface GoogleCampaignSpec {
    name: string;
    /** Daily budget in the account currency's MAJOR units (converted to micros here) */
    dailyBudget: number;
}

export interface GoogleAdGroupSpec {
    name: string;
    keywords: string[]; // broad match
}

export interface GoogleRsaSpec {
    /** 3–15 headlines, each ≤ 30 chars */
    headlines: string[];
    /** 2–4 descriptions, each ≤ 90 chars */
    descriptions: string[];
    finalUrl: string;
}

function adsHeaders(context: WriteContext): Record<string, string> {
    if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
        throw new Error('Google Ads is not configured. Missing GOOGLE_ADS_DEVELOPER_TOKEN.');
    }
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${context.accessToken}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
    };
    const loginCustomerId = context.account.googleMetadata?.loginCustomerId;
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
    return headers;
}

async function mutate(
    context: WriteContext,
    resource: string,
    operations: Record<string, unknown>[],
): Promise<string[]> {
    const customerId = context.account.externalAccountId;
    const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/${resource}:mutate`, {
        method: 'POST',
        headers: adsHeaders(context),
        body: JSON.stringify({ operations }),
    });

    if (!response.ok) {
        throw new Error(`Google Ads ${resource} mutate failed: ${await response.text()}`);
    }

    const data = await response.json();
    const resourceNames: string[] = (data.results || [])
        .map((result: { resourceName?: string }) => result.resourceName)
        .filter(Boolean);
    if (resourceNames.length !== operations.length) {
        throw new Error(`Google Ads ${resource} mutate returned ${resourceNames.length}/${operations.length} resources`);
    }
    return resourceNames;
}

/** Budget + Search campaign, PAUSED, Maximize-Clicks bidding. */
export async function createGoogleCampaign(
    context: WriteContext,
    spec: GoogleCampaignSpec,
): Promise<{ budgetResourceName: string; campaignResourceName: string; campaignId: string }> {
    const budgetResourceName = await audited(
        context,
        'create_campaign_budget',
        { name: spec.name, dailyBudget: spec.dailyBudget },
        async () => {
            const [resourceName] = await mutate(context, 'campaignBudgets', [{
                create: {
                    name: `${spec.name} budget ${Date.now()}`,
                    amountMicros: String(Math.round(spec.dailyBudget * 1_000_000)),
                    deliveryMethod: 'STANDARD',
                    explicitlyShared: false,
                },
            }]);
            return { resourceName };
        },
    ).then((result) => result.resourceName as string);

    const campaignResourceName = await audited(
        context,
        'create_campaign',
        { name: spec.name, budgetResourceName },
        async () => {
            const [resourceName] = await mutate(context, 'campaigns', [{
                create: {
                    name: spec.name,
                    status: 'PAUSED', // guardrail — never created live
                    advertisingChannelType: 'SEARCH',
                    campaignBudget: budgetResourceName,
                    targetSpend: {}, // Maximize clicks
                    networkSettings: {
                        targetGoogleSearch: true,
                        targetSearchNetwork: false,
                        targetContentNetwork: false,
                        targetPartnerSearchNetwork: false,
                    },
                },
            }]);
            return { resourceName };
        },
    ).then((result) => result.resourceName as string);

    const campaignId = campaignResourceName.split('/').pop() || campaignResourceName;
    return { budgetResourceName, campaignResourceName, campaignId };
}

/** Ad group + broad-match keywords under a (paused) campaign. */
export async function createGoogleAdGroup(
    context: WriteContext,
    campaignResourceName: string,
    spec: GoogleAdGroupSpec,
): Promise<{ adGroupResourceName: string }> {
    const adGroupResourceName = await audited(
        context,
        'create_ad_group',
        { campaignResourceName, name: spec.name, keywords: spec.keywords },
        async () => {
            const [resourceName] = await mutate(context, 'adGroups', [{
                create: {
                    name: spec.name,
                    campaign: campaignResourceName,
                    // The paused CAMPAIGN is the activation gate — leaving the
                    // group enabled means the user only flips one switch live.
                    status: 'ENABLED',
                    type: 'SEARCH_STANDARD',
                },
            }]);
            return { resourceName };
        },
    ).then((result) => result.resourceName as string);

    if (spec.keywords.length > 0) {
        await audited(
            context,
            'create_keywords',
            { adGroupResourceName, keywords: spec.keywords },
            async () => {
                const resourceNames = await mutate(
                    context,
                    'adGroupCriteria',
                    spec.keywords.map((keyword) => ({
                        create: {
                            adGroup: adGroupResourceName,
                            status: 'ENABLED',
                            keyword: { text: keyword, matchType: 'BROAD' },
                        },
                    })),
                );
                return { resourceNames };
            },
        );
    }

    return { adGroupResourceName };
}

/** Responsive Search Ad under the ad group. */
export async function createGoogleRsa(
    context: WriteContext,
    adGroupResourceName: string,
    spec: GoogleRsaSpec,
): Promise<{ adResourceName: string }> {
    return audited(
        context,
        'create_rsa',
        { adGroupResourceName, ...spec },
        async () => {
            const [resourceName] = await mutate(context, 'adGroupAds', [{
                create: {
                    adGroup: adGroupResourceName,
                    status: 'ENABLED', // gated by the PAUSED campaign
                    ad: {
                        finalUrls: [spec.finalUrl],
                        responsiveSearchAd: {
                            headlines: spec.headlines.map((text) => ({ text })),
                            descriptions: spec.descriptions.map((text) => ({ text })),
                        },
                    },
                },
            }]);
            return { adResourceName: resourceName };
        },
    );
}
