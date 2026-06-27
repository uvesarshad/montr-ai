import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIntegrationProvider, isIntegrationProviderId } from '@/lib/integrations/registry';
import {
    buildAuthorizationUrl,
    generatePkcePair,
    generateState,
    IntegrationOAuthError,
    OAUTH_COOKIES,
    OAUTH_COOKIE_OPTIONS,
} from '@/lib/integrations/server/oauth';
import { resolveIntegrationContext } from '@/lib/integrations/server/route-helpers';

/**
 * Initiates the OAuth flow for any registry provider.
 * GET /api/v2/integrations/oauth/[provider]?brandId=xxx&region=eu
 *
 * - brandId (optional): pin the connection to a brand; omitted = org-level.
 * - region (Zoho only): provider datacenter.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    try {
        const auth = await resolveIntegrationContext();
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        // Throttle OAuth initiations per user (best-effort).
        const { checkRateLimitGeneric } = await import('@/lib/rate-limiter');
        const rate = await checkRateLimitGeneric({
            bucket: 'integration-connect',
            identifier: auth.context.userId,
            limit: 10,
            windowSeconds: 300,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many connection attempts. Try again shortly.' },
                { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
            );
        }

        const { provider } = await params;
        if (!isIntegrationProviderId(provider)) {
            return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
        }

        const definition = getIntegrationProvider(provider)!;
        if (definition.authType === 'api_key') {
            return NextResponse.json(
                { error: `${definition.name} connects with an API key, not OAuth` },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId') || '';
        const region = searchParams.get('region') || '';

        if (definition.regions?.length && !definition.regions.some((r) => r.id === region)) {
            return NextResponse.json(
                { error: `region is required for ${definition.name}` },
                { status: 400 }
            );
        }

        // Free-text connect parameter (e.g. Shopify shop name) travels in the
        // same `region` slot. Sanitize to a hostname-safe token.
        if (definition.textParam) {
            if (!region || !/^[a-z0-9][a-z0-9-]*$/i.test(region.replace(/\.myshopify\.com$/i, ''))) {
                return NextResponse.json(
                    { error: `${definition.textParam.label} is required for ${definition.name}` },
                    { status: 400 }
                );
            }
        }

        const state = generateState();
        const pkce = definition.authType === 'oauth2_pkce' ? generatePkcePair() : null;

        const cookieStore = await cookies();
        cookieStore.set(OAUTH_COOKIES.state, state, OAUTH_COOKIE_OPTIONS);
        cookieStore.set(OAUTH_COOKIES.provider, provider, OAUTH_COOKIE_OPTIONS);
        cookieStore.set(OAUTH_COOKIES.brandId, brandId, OAUTH_COOKIE_OPTIONS);
        cookieStore.set(OAUTH_COOKIES.region, region, OAUTH_COOKIE_OPTIONS);
        cookieStore.set(OAUTH_COOKIES.verifier, pkce?.verifier || '', OAUTH_COOKIE_OPTIONS);

        const authUrl = buildAuthorizationUrl(provider, {
            state,
            region: region || undefined,
            codeChallenge: pkce?.challenge,
        });

        return NextResponse.redirect(authUrl);
    } catch (error) {
        if (error instanceof IntegrationOAuthError && error.code === 'not_configured') {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        console.error('Integration OAuth initiation error:', error);
        return NextResponse.json({ error: 'Failed to initiate OAuth flow' }, { status: 500 });
    }
}
