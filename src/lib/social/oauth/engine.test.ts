import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildAuthorizationUrl, exchangeCode, expiresInToDate } from './exchange';
import type { SocialOAuthPlatformConfig } from './types';

function makeConfig(overrides: Partial<SocialOAuthPlatformConfig> = {}): SocialOAuthPlatformConfig {
    return {
        platform: 'testprov',
        clientIdEnv: 'TESTPROV_CLIENT_ID',
        clientSecretEnv: 'TESTPROV_CLIENT_SECRET',
        scopes: ['read', 'write'],
        authUrl: 'https://provider.example.com/oauth/authorize',
        tokenUrl: 'https://provider.example.com/oauth/token',
        tokenAuthMethod: 'body',
        persist: async () => '/done',
        ...overrides,
    };
}

describe('buildAuthorizationUrl', () => {
    it('builds a standard OAuth2 authorization URL', () => {
        const url = new URL(
            buildAuthorizationUrl(makeConfig(), {
                clientId: 'cid',
                redirectUri: 'https://app.example.com/api/social/oauth/testprov/callback',
                state: 'abc',
            })
        );
        expect(url.origin + url.pathname).toBe('https://provider.example.com/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe('cid');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('state')).toBe('abc');
        expect(url.searchParams.get('scope')).toBe('read write');
        expect(url.searchParams.get('redirect_uri')).toBe(
            'https://app.example.com/api/social/oauth/testprov/callback'
        );
    });

    it('honors comma scope separators and extra auth params', () => {
        const url = new URL(
            buildAuthorizationUrl(
                makeConfig({
                    scopeSeparator: ',',
                    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
                }),
                { clientId: 'cid', redirectUri: 'https://a/cb', state: 's' }
            )
        );
        expect(url.searchParams.get('scope')).toBe('read,write');
        expect(url.searchParams.get('access_type')).toBe('offline');
        expect(url.searchParams.get('prompt')).toBe('consent');
    });

    it('supports a custom client id param name (TikTok client_key)', () => {
        const url = new URL(
            buildAuthorizationUrl(makeConfig({ clientIdParamName: 'client_key' }), {
                clientId: 'k',
                redirectUri: 'https://a/cb',
                state: 's',
            })
        );
        expect(url.searchParams.get('client_key')).toBe('k');
        expect(url.searchParams.get('client_id')).toBeNull();
    });

    it('attaches PKCE challenge params when provided', () => {
        const url = new URL(
            buildAuthorizationUrl(makeConfig({ pkce: true }), {
                clientId: 'cid',
                redirectUri: 'https://a/cb',
                state: 's',
                codeChallenge: 'challenge123',
            })
        );
        expect(url.searchParams.get('code_challenge')).toBe('challenge123');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('resolves function scopes against the passthrough extras', () => {
        const url = new URL(
            buildAuthorizationUrl(
                makeConfig({
                    scopes: ({ extra }) => (extra.type === 'company' ? ['org.read'] : ['profile']),
                }),
                { clientId: 'cid', redirectUri: 'https://a/cb', state: 's', extra: { type: 'company' } }
            )
        );
        expect(url.searchParams.get('scope')).toBe('org.read');
    });

    it('omits the scope param entirely when scopes are empty (Notion)', () => {
        const url = new URL(
            buildAuthorizationUrl(makeConfig({ scopes: [] }), {
                clientId: 'cid',
                redirectUri: 'https://a/cb',
                state: 's',
            })
        );
        expect(url.searchParams.has('scope')).toBe(false);
    });
});

describe('exchangeCode', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        process.env.TESTPROV_CLIENT_ID = 'cid';
        process.env.TESTPROV_CLIENT_SECRET = 'csecret';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    function tokenResponse(body: Record<string, unknown>, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    it('sends client credentials in the form body by default', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'at', expires_in: 3600 }));

        const tokens = await exchangeCode(makeConfig(), { code: 'c1', redirectUri: 'https://a/cb' });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://provider.example.com/oauth/token');
        const body = new URLSearchParams(init.body as string);
        expect(body.get('client_id')).toBe('cid');
        expect(body.get('client_secret')).toBe('csecret');
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('code')).toBe('c1');
        expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(tokens.accessToken).toBe('at');
        expect(tokens.expiresIn).toBe(3600);
    });

    it('uses Basic auth + JSON body when configured (Notion shape)', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'at' }));

        await exchangeCode(makeConfig({ tokenAuthMethod: 'basic', tokenBodyFormat: 'json' }), {
            code: 'c1',
            redirectUri: 'https://a/cb',
        });

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.Authorization).toBe(
            `Basic ${Buffer.from('cid:csecret').toString('base64')}`
        );
        const body = JSON.parse(init.body as string);
        expect(body.client_id).toBeUndefined();
        expect(body.code).toBe('c1');
        expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('forwards the PKCE verifier and extra headers (Reddit User-Agent)', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'at' }));

        await exchangeCode(
            makeConfig({ tokenExtraHeaders: { 'User-Agent': 'Montr/1.0' } }),
            { code: 'c1', redirectUri: 'https://a/cb', verifier: 'verif' }
        );

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers['User-Agent']).toBe('Montr/1.0');
        const body = new URLSearchParams(init.body as string);
        expect(body.get('code_verifier')).toBe('verif');
    });

    it('uses the Meta GET wire format when tokenMethod is GET', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'at' }));

        await exchangeCode(makeConfig({ tokenMethod: 'GET' }), {
            code: 'c1',
            redirectUri: 'https://a/cb',
        });

        const [url, init] = fetchMock.mock.calls[0];
        const parsed = new URL(url as string);
        expect(parsed.searchParams.get('client_id')).toBe('cid');
        expect(parsed.searchParams.get('client_secret')).toBe('csecret');
        expect(parsed.searchParams.get('code')).toBe('c1');
        expect(parsed.searchParams.get('redirect_uri')).toBe('https://a/cb');
        // No grant_type and no POST body — byte-compatible with the legacy Meta callbacks.
        expect(parsed.searchParams.has('grant_type')).toBe(false);
        expect(init?.method).toBeUndefined();
        expect(init?.body).toBeUndefined();
    });

    it('throws a provider-named error on non-2xx and on missing access_token', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse({ error: 'invalid_grant' }, 400));
        await expect(
            exchangeCode(makeConfig(), { code: 'bad', redirectUri: 'https://a/cb' })
        ).rejects.toThrow(/testprov.*invalid_grant/);

        fetchMock.mockResolvedValueOnce(tokenResponse({ ok: true }));
        await expect(
            exchangeCode(makeConfig(), { code: 'c', redirectUri: 'https://a/cb' })
        ).rejects.toThrow(/no access_token/);
    });

    it('splits space- and comma-separated scope strings', async () => {
        fetchMock.mockResolvedValueOnce(
            tokenResponse({ access_token: 'at', scope: 'read,write extra' })
        );
        const tokens = await exchangeCode(makeConfig(), { code: 'c', redirectUri: 'https://a/cb' });
        expect(tokens.scopes).toEqual(['read', 'write', 'extra']);
    });
});

describe('expiresInToDate', () => {
    it('converts seconds to a future date and rejects empty values', () => {
        const date = expiresInToDate(3600);
        expect(date).toBeInstanceOf(Date);
        expect(date!.getTime()).toBeGreaterThan(Date.now() + 3500 * 1000);
        expect(expiresInToDate(undefined)).toBeUndefined();
        expect(expiresInToDate(0)).toBeUndefined();
    });
});
