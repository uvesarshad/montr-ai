/**
 * Google Ads OAuth + account-discovery helpers.
 *
 * Uses the Google Ads REST API directly (no gRPC client lib) — see
 * docs/ads-analytics-plan.md (Phase 0.4 decision).
 *
 * Requirements:
 * - GOOGLE_ADS_DEVELOPER_TOKEN: developer token from a Manager (MCC) account.
 *   Test-account access works immediately; production data needs Basic access.
 * - OAuth client: GOOGLE_ADS_CLIENT_ID/SECRET, falling back to the app-wide
 *   GOOGLE_CLIENT_ID/SECRET (the consent screen must include the adwords scope).
 */

export const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v21';
export const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

export const GOOGLE_ADS_CLIENT_ID =
    process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_ADS_CLIENT_SECRET =
    process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
export const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

export interface GoogleAdsOAuthCookieNames {
    state: string;
    brandId: string;
    accessToken: string;
    refreshToken: string;
}

export function getGoogleAdsOAuthCookieNames(): GoogleAdsOAuthCookieNames {
    return {
        state: 'google_ads_oauth_state',
        brandId: 'google_ads_oauth_brand_id',
        accessToken: 'google_ads_oauth_access_token',
        refreshToken: 'google_ads_oauth_refresh_token',
    };
}

export interface GoogleAdsAccountAsset {
    /** Customer ID, digits only (no dashes) */
    id: string;
    name: string;
    currencyCode?: string;
    timezone?: string;
    isManager: boolean;
    isTestAccount?: boolean;
    /** Manager customer ID to send as login-customer-id when accessing this account */
    loginCustomerId?: string;
}

function adsHeaders(accessToken: string, loginCustomerId?: string): Record<string, string> {
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
    return headers;
}

/**
 * Customer IDs the authenticated user has DIRECT access to.
 */
export async function listAccessibleCustomers(accessToken: string): Promise<string[]> {
    const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
        headers: adsHeaders(accessToken),
    });

    if (!response.ok) {
        throw new Error(`Google Ads listAccessibleCustomers failed: ${await response.text()}`);
    }

    const data = await response.json();
    const resourceNames: string[] = data.resourceNames || [];
    return resourceNames.map((name) => name.replace('customers/', ''));
}

interface CustomerClientRow {
    customerClient?: {
        id?: string;
        descriptiveName?: string;
        currencyCode?: string;
        timeZone?: string;
        manager?: boolean;
        testAccount?: boolean;
        level?: string | number;
    };
}

/**
 * Expand one accessible customer into its connectable accounts via the
 * customer_client resource (returns the customer itself at level 0 and,
 * for managers, direct children at level 1).
 */
async function listCustomerClients(accessToken: string, customerId: string): Promise<GoogleAdsAccountAsset[]> {
    const query = `
        SELECT
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.currency_code,
            customer_client.time_zone,
            customer_client.manager,
            customer_client.test_account,
            customer_client.level
        FROM customer_client
        WHERE customer_client.status = 'ENABLED' AND customer_client.level <= 1
    `;

    const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
        method: 'POST',
        headers: adsHeaders(accessToken, customerId),
        body: JSON.stringify({ query }),
    });

    if (!response.ok) {
        throw new Error(`Google Ads customer_client query failed for ${customerId}: ${await response.text()}`);
    }

    const data = await response.json();
    const rows: CustomerClientRow[] = data.results || [];

    return rows
        .filter((row) => Boolean(row.customerClient?.id))
        .map((row) => {
            const client = row.customerClient!;
            const id = String(client.id);
            const isSelf = id === customerId;
            return {
                id,
                name: client.descriptiveName || `Google Ads ${id}`,
                currencyCode: client.currencyCode,
                timezone: client.timeZone,
                isManager: Boolean(client.manager),
                isTestAccount: Boolean(client.testAccount),
                // Children under a manager must be accessed with the manager
                // as login-customer-id; the root itself needs none.
                loginCustomerId: isSelf ? undefined : customerId,
            };
        });
}

/**
 * Discover every connectable Google Ads account for the user: all directly
 * accessible customers, expanded one level through manager (MCC) accounts.
 * Per-customer failures (cancelled accounts, missing permissions) are
 * tolerated and skipped.
 */
export async function discoverGoogleAdsAccounts(accessToken: string): Promise<GoogleAdsAccountAsset[]> {
    const customerIds = await listAccessibleCustomers(accessToken);
    const seen = new Map<string, GoogleAdsAccountAsset>();

    for (const customerId of customerIds) {
        try {
            const clients = await listCustomerClients(accessToken, customerId);
            for (const client of clients) {
                // Prefer the direct-access entry (no login-customer-id needed)
                const existing = seen.get(client.id);
                if (!existing || (existing.loginCustomerId && !client.loginCustomerId)) {
                    seen.set(client.id, client);
                }
            }
        } catch (error) {
            console.error(`Google Ads account discovery skipped customer ${customerId}:`, error);
        }
    }

    return Array.from(seen.values());
}
