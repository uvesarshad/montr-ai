/**
 * Social OAuth engine — pure, framework-free pieces (auth-URL building and
 * the code→token exchange). Kept free of next/auth imports so they are unit
 * testable; engine.ts wires them into the request/response flow.
 */

import type { SocialOAuthPlatformConfig, SocialOAuthTokenSet } from './types';

export function resolveScopes(
    config: SocialOAuthPlatformConfig,
    extra: Record<string, string>
): string[] {
    return typeof config.scopes === 'function' ? config.scopes({ extra }) : config.scopes;
}

/**
 * Pure auth-URL builder — exposed for unit tests.
 */
export function buildAuthorizationUrl(
    config: SocialOAuthPlatformConfig,
    params: {
        clientId: string;
        redirectUri: string;
        state: string;
        extra?: Record<string, string>;
        codeChallenge?: string;
    }
): string {
    const url = new URL(config.authUrl);
    url.searchParams.set(config.clientIdParamName || 'client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', params.state);
    const scopes = resolveScopes(config, params.extra || {});
    if (scopes.length > 0) {
        url.searchParams.set('scope', scopes.join(config.scopeSeparator ?? ' '));
    }
    for (const [key, value] of Object.entries(config.extraAuthParams || {})) {
        url.searchParams.set(key, value);
    }
    if (params.codeChallenge) {
        url.searchParams.set('code_challenge', params.codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
}

/**
 * Code → tokens, config-driven.
 */
export async function exchangeCode(
    config: SocialOAuthPlatformConfig,
    params: { code: string; redirectUri: string; verifier?: string }
): Promise<SocialOAuthTokenSet> {
    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) {
        throw new Error(
            `${config.platform}: OAuth not configured (missing ${config.clientIdEnv} / ${config.clientSecretEnv}).`
        );
    }

    let response: Response;
    if (config.tokenMethod === 'GET') {
        // Meta wire format: credentials + code in the query string, no
        // grant_type, plain GET (matches the legacy facebook/instagram/threads
        // callbacks byte-for-byte).
        const url = new URL(config.tokenUrl);
        url.searchParams.set(config.clientIdParamName || 'client_id', clientId);
        url.searchParams.set('client_secret', clientSecret);
        url.searchParams.set('code', params.code);
        url.searchParams.set('redirect_uri', params.redirectUri);
        if (params.verifier) url.searchParams.set('code_verifier', params.verifier);
        response = await fetch(url.toString(), { headers: config.tokenExtraHeaders });
    } else {
        const body: Record<string, string> = {
            grant_type: 'authorization_code',
            code: params.code,
            redirect_uri: params.redirectUri,
        };
        if (params.verifier) body.code_verifier = params.verifier;

        const headers: Record<string, string> = { ...(config.tokenExtraHeaders || {}) };
        if (config.tokenAuthMethod === 'basic') {
            headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
        } else {
            body[config.clientIdParamName || 'client_id'] = clientId;
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

        response = await fetch(config.tokenUrl, { method: 'POST', headers, body: requestBody });
    }
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
        const detail =
            typeof raw.error_description === 'string'
                ? raw.error_description
                : typeof raw.error === 'string'
                  ? raw.error
                  : `HTTP ${response.status}`;
        throw new Error(`${config.platform}: token exchange failed — ${detail}`);
    }

    const accessToken = typeof raw.access_token === 'string' ? raw.access_token : null;
    if (!accessToken) {
        throw new Error(`${config.platform}: token response had no access_token`);
    }

    return {
        accessToken,
        refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
        expiresIn: typeof raw.expires_in === 'number' ? raw.expires_in : undefined,
        scopes: typeof raw.scope === 'string' ? raw.scope.split(/[\s,]+/).filter(Boolean) : undefined,
        raw,
    };
}

/**
 * Refresh tokens via the platform's token endpoint (audit C6 — generic
 * social-account refresh cron). Uses the same config-driven wire format as
 * exchangeCode but with `grant_type=refresh_token`. Framework-free (no
 * next/auth) so it is safe to call from the tsx worker.
 *
 * Throws when OAuth isn't configured or the endpoint rejects the refresh.
 * Some providers (e.g. reddit) only return a fresh access_token and omit the
 * refresh_token — in that case the existing refresh token is preserved by the
 * caller.
 */
export async function refreshAccessToken(
    config: SocialOAuthPlatformConfig,
    refreshToken: string
): Promise<SocialOAuthTokenSet> {
    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) {
        throw new Error(
            `${config.platform}: OAuth not configured (missing ${config.clientIdEnv} / ${config.clientSecretEnv}).`
        );
    }

    const body: Record<string, string> = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    };

    const headers: Record<string, string> = { ...(config.tokenExtraHeaders || {}) };
    if (config.tokenAuthMethod === 'basic') {
        headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
        body[config.clientIdParamName || 'client_id'] = clientId;
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

    const response = await fetch(config.tokenUrl, { method: 'POST', headers, body: requestBody });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
        const detail =
            typeof raw.error_description === 'string'
                ? raw.error_description
                : typeof raw.error === 'string'
                  ? raw.error
                  : `HTTP ${response.status}`;
        throw new Error(`${config.platform}: token refresh failed — ${detail}`);
    }

    const accessToken = typeof raw.access_token === 'string' ? raw.access_token : null;
    if (!accessToken) {
        throw new Error(`${config.platform}: refresh response had no access_token`);
    }

    return {
        accessToken,
        refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
        expiresIn: typeof raw.expires_in === 'number' ? raw.expires_in : undefined,
        scopes: typeof raw.scope === 'string' ? raw.scope.split(/[\s,]+/).filter(Boolean) : undefined,
        raw,
    };
}

/** Seconds-from-now → Date (or undefined). */
export function expiresInToDate(expiresIn?: number): Date | undefined {
    if (!expiresIn || expiresIn <= 0) return undefined;
    return new Date(Date.now() + expiresIn * 1000);
}
