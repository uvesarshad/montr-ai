/**
 * Social OAuth engine — shared types.
 *
 * One engine (engine.ts) runs the OAuth dance for every social platform; the
 * per-platform differences live in a SocialOAuthPlatformConfig (platforms/).
 * Storage targets are unchanged from the legacy routes: SocialAccount for
 * publishing platforms, CRM email/calendar accounts for gmail/outlook flows,
 * user storage for google-drive. The engine never stores anything itself —
 * each config's persist() hook owns that.
 */

export interface SocialOAuthTokenSet {
    accessToken: string;
    refreshToken?: string;
    /** Seconds until expiry, when the provider reports one. */
    expiresIn?: number;
    scopes?: string[];
    /** Raw token endpoint response for provider-specific fields. */
    raw: Record<string, unknown>;
}

export interface SocialOAuthContext {
    platform: string;
    brandId: string;
    /** Session user completing the flow (verified in the callback). */
    userId: string;
    /**
     * Values carried from the initiate request through the flow cookies
     * (declared per platform via passthroughParams — e.g. linkedin `type`,
     * gmail/outlook `source`).
     */
    extra: Record<string, string>;
    /** The exact redirect URI used in the exchange (per-platform path). */
    redirectUri: string;
}

export interface PersistResult {
    /** Where to send the browser after a successful connection. */
    redirect: string;
    /** Cookies to set on the redirect response (Meta user-token handoff). */
    cookies?: Array<{ name: string; value: string; maxAge?: number }>;
}

export interface SocialOAuthPlatformConfig {
    platform: string;
    /** Env var names — NEXT_PUBLIC_* allowed (several legacy apps used them). */
    clientIdEnv: string;
    clientSecretEnv: string;

    /** Scopes requested at authorization time. */
    scopes: string[] | ((ctx: { extra: Record<string, string> }) => string[]);
    /** How scopes are joined in the auth URL (default ' '). */
    scopeSeparator?: string;

    authUrl: string;
    /** Static extra params for the auth URL (access_type, prompt, owner, duration…). */
    extraAuthParams?: Record<string, string>;
    /** PKCE S256 (x, tiktok). */
    pkce?: boolean;

    tokenUrl: string;
    /** How client credentials reach the token endpoint. */
    tokenAuthMethod: 'basic' | 'body';
    /** Token request body encoding (default 'form'). */
    tokenBodyFormat?: 'form' | 'json';
    /**
     * HTTP method for the token exchange (default 'POST'). Meta's
     * oauth/access_token is historically called via GET with the credentials
     * in the query string and no grant_type — facebook/instagram/threads
     * keep that exact wire format.
     */
    tokenMethod?: 'POST' | 'GET';
    /** Extra headers on the token request (reddit's User-Agent). */
    tokenExtraHeaders?: Record<string, string>;
    /** TikTok sends client_key instead of client_id. */
    clientIdParamName?: string;

    /** Initiate query params persisted through the flow into ctx.extra. */
    passthroughParams?: string[];

    /**
     * Allow the flow to run without a brandId (gmail/outlook CRM flows pass
     * only ?source=crm). ctx.brandId is '' in that case.
     */
    allowMissingBrand?(extra: Record<string, string>): boolean;

    /**
     * Override the redirect URI (default: NEXT_PUBLIC_APP_URL + the per-platform
     * callback path). X uses this — its app URL can differ via X_OAUTH_APP_URL.
     */
    redirectUriOverride?(): string;

    /**
     * Store the connection and return the success redirect. Throwing here
     * sends the browser to the platform's error redirect.
     */
    persist(tokens: SocialOAuthTokenSet, ctx: SocialOAuthContext): Promise<string | PersistResult>;

    /**
     * Where to send the browser when anything fails. Defaults to
     * /social/oauth-callback?error={code} (the popup-closing page).
     * `extra` carries the passthrough params when the flow got far enough to
     * read them (outlook's CRM flow routes errors to settings instead).
     */
    errorRedirect?(code: string, extra?: Record<string, string>): string;
}
