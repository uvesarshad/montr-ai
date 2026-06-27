import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIntegrationProvider, isIntegrationProviderId } from '@/lib/integrations/registry';
import {
    exchangeCodeForTokens,
    expiresInToDate,
    getOAuthConfig,
    OAUTH_COOKIES,
} from '@/lib/integrations/server/oauth';
import { resolveIntegrationContext } from '@/lib/integrations/server/route-helpers';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';

function settingsRedirect(query: string): NextResponse {
    return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=connections&${query}`
    );
}

/**
 * Generic OAuth callback for registry providers.
 * GET /api/v2/integrations/oauth/[provider]/callback?code=xxx&state=xxx
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    const { provider } = await params;

    try {
        const auth = await resolveIntegrationContext();
        if (!auth.ok) {
            return settingsRedirect('error=not_authenticated');
        }

        if (!isIntegrationProviderId(provider)) {
            return settingsRedirect('error=unknown_provider');
        }
        const definition = getIntegrationProvider(provider)!;

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const providerError = searchParams.get('error');

        if (providerError) {
            console.error(`${provider} OAuth error:`, providerError);
            return settingsRedirect(`error=${encodeURIComponent(providerError)}`);
        }
        if (!code || !state) {
            return settingsRedirect('error=missing_params');
        }

        // Verify state + flow cookies
        const cookieStore = await cookies();
        const storedState = cookieStore.get(OAUTH_COOKIES.state)?.value;
        const storedProvider = cookieStore.get(OAUTH_COOKIES.provider)?.value;
        const brandId = cookieStore.get(OAUTH_COOKIES.brandId)?.value || null;
        const region = cookieStore.get(OAUTH_COOKIES.region)?.value || undefined;
        const codeVerifier = cookieStore.get(OAUTH_COOKIES.verifier)?.value || undefined;

        for (const name of Object.values(OAUTH_COOKIES)) {
            cookieStore.delete(name);
        }

        if (!storedState || state !== storedState || storedProvider !== provider) {
            return settingsRedirect('error=invalid_state');
        }

        // Provider-specific redirect verification (e.g. Shopify's hmac param).
        const oauthConfigForVerify = getOAuthConfig(provider);
        if (oauthConfigForVerify.verifyCallback && !oauthConfigForVerify.verifyCallback(searchParams)) {
            return settingsRedirect('error=invalid_signature');
        }

        // Exchange code → tokens
        const tokens = await exchangeCodeForTokens(provider, {
            code,
            codeVerifier: codeVerifier || undefined,
            region,
        });

        // Identify the connected account
        const oauthConfig = getOAuthConfig(provider);
        const accountInfo = await oauthConfig.fetchAccountInfo(tokens, { region });

        const connection = await integrationConnectionRepository.upsertByExternalAccount({
            brandId,
            provider,
            authType: definition.authType,
            credentials: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
            tokenExpiresAt: expiresInToDate(tokens.expiresIn),
            scopes: tokens.scopes || oauthConfig.scopes,
            externalAccountId: accountInfo.externalAccountId,
            externalAccountName: accountInfo.externalAccountName,
            metadata: accountInfo.metadata,
            connectedBy: auth.context.userId,
        });

        // Shopify: auto-register the READ webhook subscriptions for this
        // connection (orders/create, customers/create, app/uninstalled, plus the
        // cart-recovery + order-paid topics carts/update, checkouts/create,
        // checkouts/update, orders/paid — see shopify-webhooks.ts). Best-effort —
        // a registration failure must not break the connect flow. Topics are
        // added at connect time and are idempotent, so existing connections pick
        // up newly-added topics on their next (re)connect.
        if (provider === 'shopify') {
            const shop = typeof accountInfo.metadata?.shop === 'string' ? accountInfo.metadata.shop : null;
            if (shop) {
                try {
                    const { registerShopifyWebhooks } = await import(
                        '@/lib/integrations/server/shopify-webhooks'
                    );
                    const result = await registerShopifyWebhooks({
                        shop,
                        accessToken: tokens.accessToken,
                        connectionId: connection._id!.toString(),
                    });
                    if (result.errors.length > 0) {
                        console.warn('[integrations.shopify] webhook registration partial:', result.errors);
                    }
                } catch (err) {
                    console.error('[integrations.shopify] webhook registration failed:', err);
                }
            }
        }

        return settingsRedirect(`success=${provider}_connected`);
    } catch (error) {
        console.error(`Integration OAuth callback error (${provider}):`, error);
        return settingsRedirect('error=callback_failed');
    }
}
