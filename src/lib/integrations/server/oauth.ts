/**
 * Generic OAuth 2.0 flow helpers for the integrations hub.
 *
 * One implementation of state/PKCE/token-exchange/refresh shared by every
 * OAuth provider in the registry — provider differences live in
 * provider-config.ts, not here.
 */

import crypto from 'crypto';
import type { IntegrationProviderId } from '@/lib/integrations/registry';
import {
    getProviderServerConfig,
    type NormalizedTokenSet,
    type OAuthProviderServerConfig,
} from './provider-config';

export class IntegrationOAuthError extends Error {
    constructor(
        message: string,
        public readonly code: string
    ) {
        super(message);
        this.name = 'IntegrationOAuthError';
    }
}

export function getOAuthConfig(provider: IntegrationProviderId): OAuthProviderServerConfig {
    const config = getProviderServerConfig(provider).oauth;
    if (!config) {
        throw new IntegrationOAuthError(`${provider} does not support OAuth`, 'oauth_unsupported');
    }
    return config;
}

export function getOAuthClientCredentials(provider: IntegrationProviderId): {
    clientId: string;
    clientSecret: string;
} {
    const config = getOAuthConfig(provider);
    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) {
        throw new IntegrationOAuthError(
            `${provider} OAuth is not configured. Missing ${config.clientIdEnv} / ${config.clientSecretEnv}.`,
            'not_configured'
        );
    }
    return { clientId, clientSecret };
}

export function getRedirectUri(provider: IntegrationProviderId): string {
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/v2/integrations/oauth/${provider}/callback`;
}

export function generateState(): string {
    return crypto.randomBytes(16).toString('hex');
}

/** PKCE verifier + S256 challenge pair (RFC 7636). */
export function generatePkcePair(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

export function buildAuthorizationUrl(
    provider: IntegrationProviderId,
    params: { state: string; region?: string; codeChallenge?: string }
): string {
    const config = getOAuthConfig(provider);
    const { clientId } = getOAuthClientCredentials(provider);

    return config.buildAuthUrl({
        clientId,
        redirectUri: getRedirectUri(provider),
        state: params.state,
        scopes: config.scopes,
        region: params.region,
        codeChallenge: params.codeChallenge,
    });
}

interface TokenRequestParams {
    grantType: 'authorization_code' | 'refresh_token';
    code?: string;
    refreshToken?: string;
    codeVerifier?: string;
    region?: string;
}

async function requestTokens(
    provider: IntegrationProviderId,
    params: TokenRequestParams
): Promise<NormalizedTokenSet> {
    const config = getOAuthConfig(provider);
    const { clientId, clientSecret } = getOAuthClientCredentials(provider);

    const body: Record<string, string> = { grant_type: params.grantType };
    if (params.grantType === 'authorization_code') {
        body.code = params.code!;
        body.redirect_uri = getRedirectUri(provider);
        if (params.codeVerifier) body.code_verifier = params.codeVerifier;
    } else {
        body.refresh_token = params.refreshToken!;
    }

    const headers: Record<string, string> = {};
    if (config.tokenAuthMethod === 'basic') {
        headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
        body.client_id = clientId;
        body.client_secret = clientSecret;
    }

    let requestBody: string;
    if (config.tokenBodyFormat === 'json') {
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
    } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        requestBody = new URLSearchParams(body).toString();
    }

    const response = await fetch(config.tokenUrl({ region: params.region }), {
        method: 'POST',
        headers,
        body: requestBody,
    });

    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
        const detail =
            typeof raw.error_description === 'string'
                ? raw.error_description
                : typeof raw.error === 'string'
                  ? raw.error
                  : `HTTP ${response.status}`;
        throw new IntegrationOAuthError(
            `${provider} token ${params.grantType === 'refresh_token' ? 'refresh' : 'exchange'} failed: ${detail}`,
            'token_exchange_failed'
        );
    }

    const accessToken = typeof raw.access_token === 'string' ? raw.access_token : null;
    if (!accessToken) {
        throw new IntegrationOAuthError(
            `${provider} token response had no access_token`,
            'token_exchange_failed'
        );
    }

    return {
        accessToken,
        refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
        expiresIn: typeof raw.expires_in === 'number' ? raw.expires_in : undefined,
        scopes:
            typeof raw.scope === 'string'
                ? raw.scope.split(/[\s,]+/).filter(Boolean)
                : undefined,
        raw,
    };
}

export async function exchangeCodeForTokens(
    provider: IntegrationProviderId,
    params: { code: string; codeVerifier?: string; region?: string }
): Promise<NormalizedTokenSet> {
    return requestTokens(provider, {
        grantType: 'authorization_code',
        code: params.code,
        codeVerifier: params.codeVerifier,
        region: params.region,
    });
}

export async function refreshAccessToken(
    provider: IntegrationProviderId,
    params: { refreshToken: string; region?: string }
): Promise<NormalizedTokenSet> {
    return requestTokens(provider, {
        grantType: 'refresh_token',
        refreshToken: params.refreshToken,
        region: params.region,
    });
}

export function expiresInToDate(expiresIn?: number): Date | null {
    if (!expiresIn || expiresIn <= 0) return null;
    return new Date(Date.now() + expiresIn * 1000);
}

// ── OAuth flow cookies ───────────────────────────────────────────────
// One generic set of cookie names — the provider id is stored alongside the
// state so the callback can reject mismatched flows.

export const OAUTH_COOKIES = {
    state: 'intg_oauth_state',
    provider: 'intg_oauth_provider',
    brandId: 'intg_oauth_brand_id',
    region: 'intg_oauth_region',
    verifier: 'intg_oauth_verifier',
} as const;

export const OAUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600, // 10 minutes
    path: '/',
};
