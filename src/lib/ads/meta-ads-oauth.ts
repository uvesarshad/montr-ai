/**
 * Meta Ads OAuth helpers — mirrors src/lib/social/meta-oauth.ts for the
 * Marketing API (ad accounts) instead of Pages/Instagram assets.
 *
 * Token model: we exchange the short-lived user token for a long-lived
 * user token (~60 days) and store THAT per connected ad account. Insights
 * reads use the user token directly against /act_{account_id}.
 */

// Newer Graph version than the social module's v18.0 — the Marketing API
// retires versions on its own schedule; override via env if needed.
export const META_ADS_GRAPH_VERSION = process.env.META_ADS_GRAPH_VERSION || 'v21.0';
export const META_ADS_GRAPH_BASE = `https://graph.facebook.com/${META_ADS_GRAPH_VERSION}`;

export interface MetaAdsOAuthCookieNames {
    state: string;
    brandId: string;
    userToken: string;
}

export function getMetaAdsOAuthCookieNames(): MetaAdsOAuthCookieNames {
    return {
        state: 'meta_ads_oauth_state',
        brandId: 'meta_ads_oauth_brand_id',
        userToken: 'meta_ads_oauth_user_token',
    };
}

export interface MetaAdAccountAsset {
    /** Numeric ad account ID without the "act_" prefix */
    id: string;
    name: string;
    currencyCode?: string;
    timezone?: string;
    accountStatus?: number; // 1 = active, 2 = disabled, 3 = unsettled, ...
    businessId?: string;
    businessName?: string;
}

interface MetaAdAccountRaw {
    id?: string;          // "act_123..."
    account_id?: string;  // "123..."
    name?: string;
    currency?: string;
    timezone_name?: string;
    account_status?: number;
    business?: { id?: string; name?: string };
}

interface MetaAdAccountsResponse {
    data?: MetaAdAccountRaw[];
    paging?: { next?: string };
}

/**
 * Exchange a short-lived user token for a long-lived (~60 day) user token.
 */
export async function exchangeForLongLivedToken(
    shortLivedToken: string,
    appId: string,
    appSecret: string,
): Promise<{ accessToken: string; expiresAt?: Date }> {
    const url = new URL(`${META_ADS_GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Meta long-lived token exchange failed: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        accessToken: data.access_token as string,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
}

/**
 * List the ad accounts the user can access (follows pagination, capped).
 */
export async function fetchMetaAdAccounts(userAccessToken: string): Promise<MetaAdAccountAsset[]> {
    const accounts: MetaAdAccountRaw[] = [];
    const firstUrl = new URL(`${META_ADS_GRAPH_BASE}/me/adaccounts`);
    firstUrl.searchParams.set(
        'fields',
        'id,account_id,name,currency,timezone_name,account_status,business{id,name}',
    );
    firstUrl.searchParams.set('limit', '100');
    firstUrl.searchParams.set('access_token', userAccessToken);

    let nextUrl: string | undefined = firstUrl.toString();
    let pages = 0;

    while (nextUrl && pages < 5) { // cap at 500 accounts
        const response = await fetch(nextUrl);
        if (!response.ok) {
            throw new Error(`Meta ad account fetch failed: ${await response.text()}`);
        }
        const body: MetaAdAccountsResponse = await response.json();
        accounts.push(...(body.data || []));
        nextUrl = body.paging?.next;
        pages += 1;
    }

    return accounts
        .filter((account) => Boolean(account.account_id || account.id))
        .map((account) => ({
            id: (account.account_id || (account.id as string).replace(/^act_/, '')) as string,
            name: account.name || `Ad account ${account.account_id || account.id}`,
            currencyCode: account.currency,
            timezone: account.timezone_name,
            accountStatus: account.account_status,
            businessId: account.business?.id,
            businessName: account.business?.name,
        }));
}
