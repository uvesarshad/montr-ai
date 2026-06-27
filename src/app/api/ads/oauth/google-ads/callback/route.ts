import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
    getGoogleAdsOAuthCookieNames,
    GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET,
} from '@/lib/ads/google-ads-oauth';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/oauth/google-ads/callback`;

/**
 * Handles Google Ads OAuth 2.0 callback
 * GET /api/ads/oauth/google-ads/callback?code=xxx&state=xxx
 *
 * Stores the tokens in short-lived cookies and sends the user to the
 * ad-account picker (assets/select flow) — account discovery needs the
 * developer token and may span MCC trees, so selection is a separate step.
 */
export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const cookieNames = getGoogleAdsOAuthCookieNames();

    try {
        if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET) {
            return redirectWithError('Google Ads OAuth is not configured');
        }

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        if (error) {
            console.error('Google Ads OAuth error:', error);
            return redirectWithError(error);
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

        // Exchange code for tokens
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_ADS_CLIENT_ID,
                client_secret: GOOGLE_ADS_CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            console.error('Google Ads token exchange error:', errorData);
            return redirectWithError('Failed to exchange authorization code');
        }

        const tokenData = await tokenResponse.json();
        const { access_token, refresh_token } = tokenData;

        if (!refresh_token) {
            // prompt=consent should always yield one; without it scheduled
            // syncs would die after an hour, so fail loudly here.
            return redirectWithError('Google did not return a refresh token. Please try connecting again.');
        }

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            maxAge: 600,
            path: '/',
        };
        cookieStore.set(cookieNames.accessToken, access_token, cookieOptions);
        cookieStore.set(cookieNames.refreshToken, refresh_token, cookieOptions);
        cookieStore.set(cookieNames.brandId, brandId, cookieOptions);
        cookieStore.delete(cookieNames.state);

        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL}/social/oauth-callback?ads=select&platform=google_ads`
        );

    } catch (error) {
        console.error('Google Ads OAuth callback error:', error);
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
    const cookieNames = getGoogleAdsOAuthCookieNames();
    cookieStore.delete(cookieNames.state);
    cookieStore.delete(cookieNames.brandId);
    cookieStore.delete(cookieNames.accessToken);
    cookieStore.delete(cookieNames.refreshToken);
}
