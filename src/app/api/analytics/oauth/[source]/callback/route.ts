import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
    ANALYTICS_GOOGLE_CLIENT_ID,
    ANALYTICS_GOOGLE_CLIENT_SECRET,
    getAnalyticsOAuthCookieNames,
} from '@/lib/analytics/analytics-oauth';
import { parseAnalyticsSourceType } from '@/lib/analytics/analytics-oauth-picker';
import type { AnalyticsSourceType } from '@/lib/db/models/analytics-source.model';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Handles the Google OAuth 2.0 callback for an analytics source.
 * GET /api/analytics/oauth/{ga4|search_console}/callback?code=xxx&state=xxx
 *
 * Stores the tokens in short-lived cookies and sends the user to the
 * property/site picker (assets/select flow).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ source: string }> }
) {
    const sourceType = parseAnalyticsSourceType((await params).source);
    if (!sourceType) {
        return NextResponse.json({ error: 'Invalid analytics source' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const cookieNames = getAnalyticsOAuthCookieNames(sourceType);

    try {
        if (!ANALYTICS_GOOGLE_CLIENT_ID || !ANALYTICS_GOOGLE_CLIENT_SECRET) {
            return redirectWithError('Google OAuth is not configured');
        }

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        if (error) {
            console.error(`Analytics source (${sourceType}) OAuth error:`, error);
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
                client_id: ANALYTICS_GOOGLE_CLIENT_ID,
                client_secret: ANALYTICS_GOOGLE_CLIENT_SECRET,
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/analytics/oauth/${sourceType}/callback`,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            console.error(`Analytics source (${sourceType}) token exchange error:`, errorData);
            return redirectWithError('Failed to exchange authorization code');
        }

        const tokenData = await tokenResponse.json();
        const { access_token, refresh_token } = tokenData;

        if (!refresh_token) {
            // Without a refresh token scheduled syncs would die after an hour.
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
            `${process.env.NEXT_PUBLIC_APP_URL}/social/oauth-callback?analytics=select&platform=${sourceType}`
        );

    } catch (error) {
        console.error(`Analytics source (${sourceType}) OAuth callback error:`, error);
        clearOAuthCookies(cookieStore, sourceType);
        return redirectWithError('An unexpected error occurred');
    }
}

function redirectWithError(message: string) {
    return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/social/oauth-callback?error=${encodeURIComponent(message)}`
    );
}

function clearOAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>, sourceType: AnalyticsSourceType) {
    const cookieNames = getAnalyticsOAuthCookieNames(sourceType);
    cookieStore.delete(cookieNames.state);
    cookieStore.delete(cookieNames.brandId);
    cookieStore.delete(cookieNames.accessToken);
    cookieStore.delete(cookieNames.refreshToken);
}
