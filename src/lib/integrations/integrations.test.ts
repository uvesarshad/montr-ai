import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import {
    INTEGRATION_PROVIDERS,
    getIntegrationProvider,
    isIntegrationProviderId,
} from './registry';
import { PROVIDER_SERVER_CONFIG } from './server/provider-config';
import {
    generatePkcePair,
    generateState,
    expiresInToDate,
    buildAuthorizationUrl,
    getOAuthConfig,
} from './server/oauth';

describe('integration registry', () => {
    it('has unique provider ids', () => {
        const ids = INTEGRATION_PROVIDERS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every provider has a server config with a test function', () => {
        for (const provider of INTEGRATION_PROVIDERS) {
            const server = PROVIDER_SERVER_CONFIG[provider.id];
            expect(server, `${provider.id} missing server config`).toBeDefined();
            expect(typeof server.test).toBe('function');
        }
    });

    it('api_key providers declare their credential fields', () => {
        for (const provider of INTEGRATION_PROVIDERS) {
            if (provider.authType === 'api_key') {
                expect(provider.apiKeyFields?.length, `${provider.id} has no apiKeyFields`).toBeGreaterThan(0);
                expect(PROVIDER_SERVER_CONFIG[provider.id].oauth).toBeUndefined();
            }
        }
    });

    it('oauth providers have matching server-side oauth config', () => {
        for (const provider of INTEGRATION_PROVIDERS) {
            if (provider.authType === 'oauth2' || provider.authType === 'oauth2_pkce') {
                const oauth = PROVIDER_SERVER_CONFIG[provider.id].oauth;
                expect(oauth, `${provider.id} missing oauth server config`).toBeDefined();
                expect(!!oauth!.pkce).toBe(provider.authType === 'oauth2_pkce');
                expect(oauth!.clientIdEnv).toMatch(/^[A-Z0-9_]+$/);
                expect(oauth!.clientSecretEnv).toMatch(/^[A-Z0-9_]+$/);
            }
        }
    });

    it('region-scoped providers declare at least one region', () => {
        for (const provider of INTEGRATION_PROVIDERS) {
            if (provider.regions) {
                expect(provider.regions.length).toBeGreaterThan(0);
            }
        }
    });

    it('lookup helpers behave', () => {
        expect(getIntegrationProvider('mailchimp')?.name).toBe('Mailchimp');
        expect(getIntegrationProvider('does-not-exist')).toBeUndefined();
        expect(isIntegrationProviderId('n8n')).toBe(true);
        expect(isIntegrationProviderId('notion')).toBe(false); // legacy social oauth, not this registry
    });
});

describe('oauth helpers', () => {
    beforeAll(() => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
        process.env.HUBSPOT_CLIENT_ID = 'test-client-id';
        process.env.HUBSPOT_CLIENT_SECRET = 'test-client-secret';
        process.env.ZOHO_CLIENT_ID = 'zoho-client-id';
        process.env.ZOHO_CLIENT_SECRET = 'zoho-client-secret';
        process.env.AIRTABLE_CLIENT_ID = 'airtable-client-id';
        process.env.AIRTABLE_CLIENT_SECRET = 'airtable-client-secret';
    });

    it('generateState returns unpredictable hex', () => {
        const a = generateState();
        const b = generateState();
        expect(a).toMatch(/^[0-9a-f]{32}$/);
        expect(a).not.toBe(b);
    });

    it('generatePkcePair produces a valid S256 challenge', () => {
        const { verifier, challenge } = generatePkcePair();
        const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
        expect(challenge).toBe(expected);
        // RFC 7636: verifier must be 43–128 chars
        expect(verifier.length).toBeGreaterThanOrEqual(43);
        expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('expiresInToDate converts seconds to a future date', () => {
        const date = expiresInToDate(1800);
        expect(date).toBeInstanceOf(Date);
        expect(date!.getTime()).toBeGreaterThan(Date.now() + 1700 * 1000);
        expect(expiresInToDate(undefined)).toBeNull();
        expect(expiresInToDate(0)).toBeNull();
    });

    it('buildAuthorizationUrl embeds client id, redirect uri and state', () => {
        const state = 'abc123';
        const url = new URL(buildAuthorizationUrl('hubspot', { state }));
        expect(url.origin + url.pathname).toBe('https://app.hubspot.com/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe('test-client-id');
        expect(url.searchParams.get('state')).toBe(state);
        expect(url.searchParams.get('redirect_uri')).toBe(
            'https://app.example.com/api/v2/integrations/oauth/hubspot/callback'
        );
        expect(url.searchParams.get('scope')).toContain('crm.objects.contacts.read');
    });

    it('buildAuthorizationUrl routes Zoho to the regional datacenter', () => {
        const url = new URL(buildAuthorizationUrl('zoho', { state: 's', region: 'eu' }));
        expect(url.hostname).toBe('accounts.zoho.eu');
        expect(url.searchParams.get('access_type')).toBe('offline');
        // Zoho scopes are comma-separated
        expect(url.searchParams.get('scope')).toContain('ZohoCRM.modules.READ,');
    });

    it('buildAuthorizationUrl attaches the PKCE challenge for Airtable', () => {
        const { challenge } = generatePkcePair();
        const url = new URL(
            buildAuthorizationUrl('airtable', { state: 's', codeChallenge: challenge })
        );
        expect(url.searchParams.get('code_challenge')).toBe(challenge);
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('getOAuthConfig throws for api_key providers', () => {
        expect(() => getOAuthConfig('apollo')).toThrowError(/does not support OAuth/);
    });
});
