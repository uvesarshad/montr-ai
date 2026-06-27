import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
    exchangeForLongLivedToken,
    getMetaAdsOAuthCookieNames,
    META_ADS_GRAPH_BASE,
} from '@/lib/ads/meta-ads-oauth';

const META_TOKEN_URL = `${META_ADS_GRAPH_BASE}/oauth/access_token`;
const FACEBOOK_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/oauth/meta-ads/callback`;

/**
 * Handles Meta Ads OAuth 2.0 callback
 * GET /api/ads/oauth/meta-ads/callback?code=xxx&state=xxx
 *
 * Exchanges the code for a long-lived user token, then sends the user to
 * the ad-account picker (assets/select flow).
 */
export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const cookieNames = getMetaAdsOAuthCookieNames();

    try {
        if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
            return redirectWithError('Meta Ads OAuth is not configured');
        }

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
            console.error('Meta Ads OAuth error:', error, errorDescription);
            return redirectWithError(errorDescription || error);
        }

        if (!code) {
            return redirectWithError('No authorization code received');
        }

        const storedState = cookieStore.get(cookieNames.state)?.value;
        if (!storedState || storedState !== state) {
            return redirectWithError('Invalid state parameter');
        }

        const brandId = cookieStore.get(cookieNames.brandId)?.value;
        if (!brandId) {
            return redirectWithError('Missing OAuth session data');
        }

        // Exchange code for a short-lived user access token
        const tokenUrl = new URL(META_TOKEN_URL);
        tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
        tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
        tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        tokenUrl.searchParams.set('code', code);

        const tokenResponse = await fetch(tokenUrl.toString());

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            console.error('Meta Ads token exchange error:', errorData);
            return redirectWithError('Failed to exchange authorization code');
        }

        const tokenData = await tokenResponse.json();

        // Upgrade to a long-lived (~60 day) user token before storing
        const longLived = await exchangeForLongLivedToken(
            tokenData.access_token,
            FACEBOOK_APP_ID,
            FACEBOOK_APP_SECRET,
        );

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            maxAge: 600,
            path: '/',
        };
        cookieStore.set(cookieNames.userToken, longLived.accessToken, cookieOptions);
        cookieStore.set(cookieNames.brandId, brandId, cookieOptions);
        cookieStore.delete(cookieNames.state);

        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL}/social/oauth-callback?ads=select&platform=meta_ads`
        );

    } catch (error) {
        console.error('Meta Ads OAuth callback error:', error);
        clearOAuthCookies(cookieStore);
        return redirectWithError('An unexpected error occurred');
    }
}

function redirectWithError(message: string) {
    return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/social/oauth-callback?error=${encodeURIComponent(message)}`
    );
}

function clearOAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
    const cookieNames = getMetaAdsOAuthCookieNames();
    cookieStore.delete(cookieNames.state);
    cookieStore.delete(cookieNames.brandId);
    cookieStore.delete(cookieNames.userToken);
}
