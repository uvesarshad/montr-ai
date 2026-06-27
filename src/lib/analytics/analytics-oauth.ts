/**
 * Google Analytics 4 + Search Console OAuth and asset-discovery helpers.
 * Read-only scopes — these sources only ever feed the analytics fetchers.
 */
import type { AnalyticsSourceType } from '@/lib/db/models/analytics-source.model';

export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export const GA4_ADMIN_API_BASE = 'https://analyticsadmin.googleapis.com/v1beta';
export const SEARCH_CONSOLE_API_BASE = 'https://www.googleapis.com/webmasters/v3';

export const ANALYTICS_GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const ANALYTICS_GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export interface AnalyticsOAuthCookieNames {
    state: string;
    brandId: string;
    accessToken: string;
    refreshToken: string;
}

export function getAnalyticsOAuthCookieNames(sourceType: AnalyticsSourceType): AnalyticsOAuthCookieNames {
    return {
        state: `${sourceType}_oauth_state`,
        brandId: `${sourceType}_oauth_brand_id`,
        accessToken: `${sourceType}_oauth_access_token`,
        refreshToken: `${sourceType}_oauth_refresh_token`,
    };
}

export interface AnalyticsSourceAsset {
    /** GA4: numeric property ID · GSC: siteUrl */
    id: string;
    name: string;
    /** GA4: parent account name · GSC: permission level */
    detail?: string;
}

interface Ga4PropertySummary {
    property?: string;       // "properties/123456"
    displayName?: string;
}

interface Ga4AccountSummary {
    displayName?: string;    // Analytics account name
    propertySummaries?: Ga4PropertySummary[];
}

interface Ga4AccountSummariesResponse {
    accountSummaries?: Ga4AccountSummary[];
    nextPageToken?: string;
}

/**
 * List the GA4 properties the user can read (Admin API account summaries).
 */
export async function fetchGa4Properties(accessToken: string): Promise<AnalyticsSourceAsset[]> {
    const assets: AnalyticsSourceAsset[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
        const url = new URL(`${GA4_ADMIN_API_BASE}/accountSummaries`);
        url.searchParams.set('pageSize', '200');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const response = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            throw new Error(`GA4 account summaries fetch failed: ${await response.text()}`);
        }

        const body: Ga4AccountSummariesResponse = await response.json();
        for (const account of body.accountSummaries || []) {
            for (const property of account.propertySummaries || []) {
                if (!property.property) continue;
                assets.push({
                    id: property.property.replace('properties/', ''),
                    name: property.displayName || property.property,
                    detail: account.displayName,
                });
            }
        }

        pageToken = body.nextPageToken;
        pages += 1;
    } while (pageToken && pages < 5);

    return assets;
}

interface SearchConsoleSiteEntry {
    siteUrl?: string;
    permissionLevel?: string;
}

interface SearchConsoleSitesResponse {
    siteEntry?: SearchConsoleSiteEntry[];
}

/**
 * List the Search Console sites the user can read.
 */
export async function fetchSearchConsoleSites(accessToken: string): Promise<AnalyticsSourceAsset[]> {
    const response = await fetch(`${SEARCH_CONSOLE_API_BASE}/sites`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Search Console sites fetch failed: ${await response.text()}`);
    }

    const body: SearchConsoleSitesResponse = await response.json();
    return (body.siteEntry || [])
        .filter((site) => Boolean(site.siteUrl) && site.permissionLevel !== 'siteUnverifiedUser')
        .map((site) => ({
            id: site.siteUrl as string,
            name: site.siteUrl as string,
            detail: site.permissionLevel,
        }));
}
