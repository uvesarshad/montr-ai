/**
 * Server-side integration provider configuration.
 *
 * Everything the generic OAuth handler and the connect/test endpoints need
 * per provider: env var names, endpoint builders, account-info fetchers and
 * live health tests. Keep this file server-only — it reads process.env.
 *
 * Adding a provider = one registry entry (../registry.ts) + one entry here.
 */

import crypto from 'crypto';
import type { IntegrationProviderId } from '@/lib/integrations/registry';
import type { IntegrationCredentials } from '@/lib/db/repository/integration-connection.repository';
import { assertSafeOutboundUrl, safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

export interface NormalizedTokenSet {
    accessToken: string;
    refreshToken?: string;
    /** Seconds until expiry, when the provider reports one. */
    expiresIn?: number;
    scopes?: string[];
    /** Raw token endpoint response, for provider-specific post-processing. */
    raw: Record<string, unknown>;
}

export interface ExternalAccountInfo {
    externalAccountId?: string;
    externalAccountName?: string;
    metadata?: Record<string, unknown>;
}

export interface OAuthProviderServerConfig {
    clientIdEnv: string;
    clientSecretEnv: string;
    /** OAuth scopes requested at authorization time. */
    scopes: string[];
    /** Separator used when serializing scopes into the auth URL (default ' '). */
    scopeSeparator?: string;
    pkce?: boolean;
    buildAuthUrl(params: {
        clientId: string;
        redirectUri: string;
        state: string;
        scopes: string[];
        region?: string;
        codeChallenge?: string;
    }): string;
    tokenUrl(params: { region?: string }): string;
    /** How client credentials are sent to the token endpoint. */
    tokenAuthMethod: 'basic' | 'body';
    /** Content type of the token request body. */
    tokenBodyFormat?: 'form' | 'json';
    refreshSupported: boolean;
    /**
     * Identify the connected account after the code exchange (workspace name,
     * portal id, dc prefix…). Errors here should throw — a connection we can't
     * identify is not worth storing.
     */
    fetchAccountInfo(tokens: NormalizedTokenSet, params: { region?: string }): Promise<ExternalAccountInfo>;
    /**
     * Optional extra verification of the OAuth redirect before the code
     * exchange (e.g. Shopify's hmac query parameter). Return false to reject.
     */
    verifyCallback?(searchParams: URLSearchParams): boolean;
}

export interface ProviderServerConfig {
    oauth?: OAuthProviderServerConfig;
    /**
     * Live health check. For api_key providers this doubles as connect-time
     * validation. Throws (or returns ok:false) on failure.
     */
    test(
        credentials: IntegrationCredentials,
        metadata: Record<string, unknown>
    ): Promise<{ ok: boolean; error?: string }>;
}

async function expectOk(response: Response | { ok: boolean; status: number }, label: string): Promise<void> {
    if (!response.ok) {
        throw new Error(`${label} returned HTTP ${response.status}`);
    }
}

function wrapTest(
    fn: (credentials: IntegrationCredentials, metadata: Record<string, unknown>) => Promise<void>
): ProviderServerConfig['test'] {
    return async (credentials, metadata) => {
        try {
            await fn(credentials, metadata);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Connection test failed' };
        }
    };
}

export const PROVIDER_SERVER_CONFIG: Record<IntegrationProviderId, ProviderServerConfig> = {
    // ── OAuth providers ──────────────────────────────────────────────

    mailchimp: {
        oauth: {
            clientIdEnv: 'MAILCHIMP_CLIENT_ID',
            clientSecretEnv: 'MAILCHIMP_CLIENT_SECRET',
            scopes: [], // Mailchimp OAuth has no scope parameter
            buildAuthUrl: ({ clientId, redirectUri, state }) => {
                const url = new URL('https://login.mailchimp.com/oauth2/authorize');
                url.searchParams.set('response_type', 'code');
                url.searchParams.set('client_id', clientId);
                url.searchParams.set('redirect_uri', redirectUri);
                url.searchParams.set('state', state);
                return url.toString();
            },
            tokenUrl: () => 'https://login.mailchimp.com/oauth2/token',
            tokenAuthMethod: 'body',
            tokenBodyFormat: 'form',
            refreshSupported: false, // Mailchimp tokens do not expire
            fetchAccountInfo: async (tokens) => {
                // The metadata endpoint reveals the datacenter prefix every
                // subsequent API call must use.
                const response = await fetch('https://login.mailchimp.com/oauth2/metadata', {
                    headers: { Authorization: `OAuth ${tokens.accessToken}` },
                });
                await expectOk(response, 'Mailchimp metadata endpoint');
                const meta = (await response.json()) as {
                    dc: string;
                    accountname: string;
                    api_endpoint: string;
                    login?: { login_id?: string };
                };
                return {
                    externalAccountId: meta.login?.login_id || meta.accountname,
                    externalAccountName: meta.accountname,
                    metadata: { dc: meta.dc, apiEndpoint: meta.api_endpoint },
                };
            },
        },
        test: wrapTest(async (credentials, metadata) => {
            const apiEndpoint = typeof metadata.apiEndpoint === 'string' ? metadata.apiEndpoint : null;
            if (!apiEndpoint || !credentials.accessToken) throw new Error('Missing Mailchimp credentials');
            const response = await fetch(`${apiEndpoint}/3.0/ping`, {
                headers: { Authorization: `Bearer ${credentials.accessToken}` },
            });
            await expectOk(response, 'Mailchimp ping');
        }),
    },

    hubspot: {
        oauth: {
            clientIdEnv: 'HUBSPOT_CLIENT_ID',
            clientSecretEnv: 'HUBSPOT_CLIENT_SECRET',
            scopes: [
                'oauth',
                'crm.objects.contacts.read',
                'crm.objects.companies.read',
                'crm.objects.deals.read',
            ],
            buildAuthUrl: ({ clientId, redirectUri, state, scopes }) => {
                const url = new URL('https://app.hubspot.com/oauth/authorize');
                url.searchParams.set('client_id', clientId);
                url.searchParams.set('redirect_uri', redirectUri);
                url.searchParams.set('scope', scopes.join(' '));
                url.searchParams.set('state', state);
                return url.toString();
            },
            tokenUrl: () => 'https://api.hubapi.com/oauth/v1/token',
            tokenAuthMethod: 'body',
            tokenBodyFormat: 'form',
            refreshSupported: true, // Access tokens expire in ~30 minutes
            fetchAccountInfo: async (tokens) => {
                const response = await fetch(
                    `https://api.hubapi.com/oauth/v1/access-tokens/${tokens.accessToken}`
                );
                await expectOk(response, 'HubSpot token introspection');
                const info = (await response.json()) as {
                    hub_id: number;
                    hub_domain: string;
                    user?: string;
                };
                return {
                    externalAccountId: String(info.hub_id),
                    externalAccountName: info.hub_domain,
                    metadata: { hubDomain: info.hub_domain, user: info.user },
                };
            },
        },
        test: wrapTest(async (credentials) => {
            if (!credentials.accessToken) throw new Error('Missing HubSpot access token');
            const response = await fetch(
                `https://api.hubapi.com/oauth/v1/access-tokens/${credentials.accessToken}`
            );
            await expectOk(response, 'HubSpot token introspection');
        }),
    },

    airtable: {
        oauth: {
            clientIdEnv: 'AIRTABLE_CLIENT_ID',
            clientSecretEnv: 'AIRTABLE_CLIENT_SECRET',
            scopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
            pkce: true, // Airtable requires PKCE (S256)
            buildAuthUrl: ({ clientId, redirectUri, state, scopes, codeChallenge }) => {
                const url = new URL('https://airtable.com/oauth2/v1/authorize');
                url.searchParams.set('response_type', 'code');
                url.searchParams.set('client_id', clientId);
                url.searchParams.set('redirect_uri', redirectUri);
                url.searchParams.set('scope', scopes.join(' '));
                url.searchParams.set('state', state);
                if (codeChallenge) {
                    url.searchParams.set('code_challenge', codeChallenge);
                    url.searchParams.set('code_challenge_method', 'S256');
                }
                return url.toString();
            },
            tokenUrl: () => 'https://airtable.com/oauth2/v1/token',
            tokenAuthMethod: 'basic',
            tokenBodyFormat: 'form',
            refreshSupported: true, // Access tokens expire in 60 minutes
            fetchAccountInfo: async (tokens) => {
                const response = await fetch('https://api.airtable.com/v0/meta/whoami', {
                    headers: { Authorization: `Bearer ${tokens.accessToken}` },
                });
                await expectOk(response, 'Airtable whoami');
                const info = (await response.json()) as { id: string; email?: string };
                return {
                    externalAccountId: info.id,
                    externalAccountName: info.email || info.id,
                };
            },
        },
        test: wrapTest(async (credentials) => {
            if (!credentials.accessToken) throw new Error('Missing Airtable access token');
            const response = await fetch('https://api.airtable.com/v0/meta/whoami', {
                headers: { Authorization: `Bearer ${credentials.accessToken}` },
            });
            await expectOk(response, 'Airtable whoami');
        }),
    },

    zoho: {
        oauth: {
            clientIdEnv: 'ZOHO_CLIENT_ID',
            clientSecretEnv: 'ZOHO_CLIENT_SECRET',
            // Zoho scopes are comma-separated; CRM read + Campaigns read.
            scopes: [
                'ZohoCRM.modules.READ',
                'ZohoCRM.settings.READ',
                'ZohoCampaigns.campaign.READ',
                'ZohoCampaigns.contact.READ',
            ],
            scopeSeparator: ',',
            buildAuthUrl: ({ clientId, redirectUri, state, scopes, region }) => {
                const tld = region || 'com';
                const url = new URL(`https://accounts.zoho.${tld}/oauth/v2/auth`);
                url.searchParams.set('response_type', 'code');
                url.searchParams.set('client_id', clientId);
                url.searchParams.set('redirect_uri', redirectUri);
                url.searchParams.set('scope', scopes.join(','));
                url.searchParams.set('state', state);
                url.searchParams.set('access_type', 'offline'); // get a refresh token
                url.searchParams.set('prompt', 'consent');
                return url.toString();
            },
            tokenUrl: ({ region }) => `https://accounts.zoho.${region || 'com'}/oauth/v2/token`,
            tokenAuthMethod: 'body',
            tokenBodyFormat: 'form',
            refreshSupported: true, // Access tokens expire in 60 minutes
            fetchAccountInfo: async (tokens, { region }) => {
                // The token response carries api_domain — the base for all API calls.
                const apiDomain =
                    typeof tokens.raw.api_domain === 'string'
                        ? tokens.raw.api_domain
                        : `https://www.zohoapis.${region || 'com'}`;
                const response = await fetch(`${apiDomain}/crm/v2/org`, {
                    headers: { Authorization: `Zoho-oauthtoken ${tokens.accessToken}` },
                });
                let accountName: string | undefined;
                let accountId: string | undefined;
                if (response.ok) {
                    const data = (await response.json()) as {
                        org?: { company_name?: string; zgid?: string }[];
                    };
                    accountName = data.org?.[0]?.company_name;
                    accountId = data.org?.[0]?.zgid;
                }
                return {
                    externalAccountId: accountId,
                    externalAccountName: accountName,
                    metadata: { region: region || 'com', apiDomain },
                };
            },
        },
        test: wrapTest(async (credentials, metadata) => {
            const apiDomain = typeof metadata.apiDomain === 'string' ? metadata.apiDomain : null;
            if (!apiDomain || !credentials.accessToken) throw new Error('Missing Zoho credentials');
            const response = await fetch(`${apiDomain}/crm/v2/org`, {
                headers: { Authorization: `Zoho-oauthtoken ${credentials.accessToken}` },
            });
            await expectOk(response, 'Zoho org endpoint');
        }),
    },

    webflow: {
        oauth: {
            clientIdEnv: 'WEBFLOW_CLIENT_ID',
            clientSecretEnv: 'WEBFLOW_CLIENT_SECRET',
            scopes: ['sites:read', 'cms:read', 'cms:write'],
            buildAuthUrl: ({ clientId, redirectUri, state, scopes }) => {
                const url = new URL('https://webflow.com/oauth/authorize');
                url.searchParams.set('response_type', 'code');
                url.searchParams.set('client_id', clientId);
                url.searchParams.set('redirect_uri', redirectUri);
                url.searchParams.set('scope', scopes.join(' '));
                url.searchParams.set('state', state);
                return url.toString();
            },
            tokenUrl: () => 'https://api.webflow.com/oauth/access_token',
            tokenAuthMethod: 'body',
            tokenBodyFormat: 'form',
            refreshSupported: false, // Webflow tokens do not expire
            fetchAccountInfo: async (tokens) => {
                const response = await fetch('https://api.webflow.com/v2/token/authorized_by', {
                    headers: { Authorization: `Bearer ${tokens.accessToken}` },
                });
                await expectOk(response, 'Webflow authorized_by');
                const info = (await response.json()) as {
                    id: string;
                    email?: string;
                    firstName?: string;
                    lastName?: string;
                };
                const name = [info.firstName, info.lastName].filter(Boolean).join(' ') || info.email;
                return { externalAccountId: info.id, externalAccountName: name };
            },
        },
        test: wrapTest(async (credentials) => {
            if (!credentials.accessToken) throw new Error('Missing Webflow access token');
            const response = await fetch('https://api.webflow.com/v2/token/authorized_by', {
                headers: { Authorization: `Bearer ${credentials.accessToken}` },
            });
            await expectOk(response, 'Webflow authorized_by');
        }),
    },

    blogger: {
        oauth: {
            // Reuses the existing Google OAuth app.
            clientIdEnv: 'GOOGLE_CLIENT_ID',
            clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
            scopes: ['https://www.googleapis.com/auth/blogger'],
            buildAuthUrl: ({ clientId, redirectUri, state, scopes }) => {
                const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
                url.searchParams.set('response_type', 'code');
                url.searchParams.set('client_id', clientId);
                url.searchParams.set('redirect_uri', redirectUri);
                url.searchParams.set('scope', scopes.join(' '));
                url.searchParams.set('state', state);
                url.searchParams.set('access_type', 'offline');
                url.searchParams.set('prompt', 'consent');
                return url.toString();
            },
            tokenUrl: () => 'https://oauth2.googleapis.com/token',
            tokenAuthMethod: 'body',
            tokenBodyFormat: 'form',
            refreshSupported: true,
            fetchAccountInfo: async (tokens) => {
                const response = await fetch('https://www.googleapis.com/blogger/v3/users/self', {
                    headers: { Authorization: `Bearer ${tokens.accessToken}` },
                });
                await expectOk(response, 'Blogger users/self');
                const info = (await response.json()) as { id: string; displayName?: string };
                return { externalAccountId: info.id, externalAccountName: info.displayName };
            },
        },
        test: wrapTest(async (credentials) => {
            if (!credentials.accessToken) throw new Error('Missing Blogger access token');
            const response = await fetch('https://www.googleapis.com/blogger/v3/users/self', {
                headers: { Authorization: `Bearer ${credentials.accessToken}` },
            });
            await expectOk(response, 'Blogger users/self');
        }),
    },

    shopify: {
        oauth: {
            clientIdEnv: 'SHOPIFY_CLIENT_ID',
            clientSecretEnv: 'SHOPIFY_CLIENT_SECRET',
            // Read-only per product decision (import direction).
            scopes: ['read_products', 'read_orders', 'read_customers'],
            scopeSeparator: ',',
            // The `region` slot carries the shop name (textParam in the registry).
            buildAuthUrl: ({ clientId, redirectUri, state, scopes, region }) => {
                const shop = (region || '').replace(/\.myshopify\.com$/i, '');
                const url = new URL(`https://${shop}.myshopify.com/admin/oauth/authorize`);
                url.searchParams.set('client_id', clientId);
                url.searchParams.set('redirect_uri', redirectUri);
                url.searchParams.set('scope', scopes.join(','));
                url.searchParams.set('state', state);
                return url.toString();
            },
            tokenUrl: ({ region }) => {
                const shop = (region || '').replace(/\.myshopify\.com$/i, '');
                return `https://${shop}.myshopify.com/admin/oauth/access_token`;
            },
            tokenAuthMethod: 'body',
            tokenBodyFormat: 'json',
            refreshSupported: false, // Offline access tokens do not expire
            // Shopify signs the OAuth redirect: hmac = HMAC-SHA256(hex) of the
            // query string (sorted, hmac excluded) keyed by the client secret.
            verifyCallback: (searchParams) => {
                const secret = process.env.SHOPIFY_CLIENT_SECRET;
                const hmac = searchParams.get('hmac');
                if (!secret || !hmac) return false;
                const message = [...searchParams.entries()]
                    .filter(([key]) => key !== 'hmac' && key !== 'signature')
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => `${key}=${value}`)
                    .join('&');
                const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
                const a = Buffer.from(digest);
                const b = Buffer.from(hmac);
                return a.length === b.length && crypto.timingSafeEqual(a, b);
            },
            fetchAccountInfo: async (tokens, { region }) => {
                const shop = (region || '').replace(/\.myshopify\.com$/i, '');
                const shopDomain = `${shop}.myshopify.com`;
                const response = await fetch(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
                    headers: { 'X-Shopify-Access-Token': tokens.accessToken },
                });
                await expectOk(response, 'Shopify shop endpoint');
                const data = (await response.json()) as {
                    shop?: { id?: number; name?: string; myshopify_domain?: string };
                };
                return {
                    externalAccountId: data.shop?.myshopify_domain || shopDomain,
                    externalAccountName: data.shop?.name || shopDomain,
                    metadata: { shop: data.shop?.myshopify_domain || shopDomain, apiVersion: '2024-10' },
                };
            },
        },
        test: wrapTest(async (credentials, metadata) => {
            const shop = typeof metadata.shop === 'string' ? metadata.shop : null;
            if (!shop || !credentials.accessToken) throw new Error('Missing Shopify credentials');
            // The shop host is user-influenced (merchant-supplied store name) →
            // SSRF guard before dialing it. safeOutboundFetch also pins DNS.
            const url = `https://${shop}/admin/api/2024-10/shop.json`;
            await assertSafeOutboundUrl(url);
            const response = await safeOutboundFetch(url, {
                headers: { 'X-Shopify-Access-Token': credentials.accessToken },
            });
            await expectOk(response, 'Shopify shop endpoint');
        }),
    },

    // ── API-key providers ────────────────────────────────────────────

    wordpress: {
        test: wrapTest(async (credentials) => {
            if (!credentials.baseUrl || !credentials.username || !credentials.appPassword) {
                throw new Error('Missing WordPress site URL, username or application password');
            }
            // User-supplied base URL → SSRF guard is mandatory.
            const base = credentials.baseUrl.replace(/\/+$/, '');
            const basicAuth = Buffer.from(
                `${credentials.username}:${credentials.appPassword}`
            ).toString('base64');
            const response = await safeOutboundFetch(`${base}/wp-json/wp/v2/users/me`, {
                headers: { Authorization: `Basic ${basicAuth}` },
            });
            await expectOk(response, 'WordPress users/me endpoint');
        }),
    },

    apollo: {
        test: wrapTest(async (credentials) => {
            if (!credentials.apiKey) throw new Error('Missing Apollo API key');
            const response = await fetch('https://api.apollo.io/api/v1/auth/health', {
                headers: { 'X-Api-Key': credentials.apiKey, 'Content-Type': 'application/json' },
            });
            await expectOk(response, 'Apollo health endpoint');
            const data = (await response.json()) as { is_logged_in?: boolean };
            if (!data.is_logged_in) throw new Error('Apollo rejected the API key');
        }),
    },

    semrush: {
        test: wrapTest(async (credentials) => {
            if (!credentials.apiKey) throw new Error('Missing Semrush API key');
            // countapiunits is free (costs no API units) and validates the key.
            const response = await fetch(
                `https://www.semrush.com/users/countapiunits.html?key=${encodeURIComponent(credentials.apiKey)}`
            );
            await expectOk(response, 'Semrush API-units endpoint');
            const body = (await response.text()).trim();
            if (!/^\d+$/.test(body)) {
                throw new Error('Semrush rejected the API key');
            }
        }),
    },

    revenuecat: {
        test: wrapTest(async (credentials) => {
            if (!credentials.apiKey) throw new Error('Missing RevenueCat API key');
            const response = await fetch('https://api.revenuecat.com/v2/projects', {
                headers: { Authorization: `Bearer ${credentials.apiKey}` },
            });
            await expectOk(response, 'RevenueCat projects endpoint');
        }),
    },

    n8n: {
        test: wrapTest(async (credentials) => {
            if (!credentials.baseUrl || !credentials.apiKey) {
                throw new Error('Missing n8n instance URL or API key');
            }
            // User-supplied base URL → SSRF guard is mandatory.
            const base = credentials.baseUrl.replace(/\/+$/, '');
            const response = await safeOutboundFetch(`${base}/api/v1/workflows?limit=1`, {
                headers: { 'X-N8N-API-KEY': credentials.apiKey },
            });
            await expectOk(response, 'n8n workflows endpoint');
        }),
    },

    calendly: {
        // Personal-access-token auth. Fixed host (api.calendly.com) → plain fetch.
        test: wrapTest(async (credentials) => {
            if (!credentials.apiKey) throw new Error('Missing Calendly personal access token');
            const response = await fetch('https://api.calendly.com/users/me', {
                headers: {
                    Authorization: `Bearer ${credentials.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            await expectOk(response, 'Calendly users/me endpoint');
        }),
    },

    stripe: {
        // Secret-key auth. Fixed host (api.stripe.com) → plain fetch.
        test: wrapTest(async (credentials) => {
            if (!credentials.apiKey) throw new Error('Missing Stripe secret key');
            const response = await fetch('https://api.stripe.com/v1/account', {
                headers: { Authorization: `Bearer ${credentials.apiKey}` },
            });
            await expectOk(response, 'Stripe account endpoint');
        }),
    },
};

export function getProviderServerConfig(id: IntegrationProviderId): ProviderServerConfig {
    return PROVIDER_SERVER_CONFIG[id];
}
