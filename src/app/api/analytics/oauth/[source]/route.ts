import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import {
    ANALYTICS_GOOGLE_CLIENT_ID,
    GA4_SCOPE,
    SEARCH_CONSOLE_SCOPE,
    getAnalyticsOAuthCookieNames,
} from '@/lib/analytics/analytics-oauth';
import { parseAnalyticsSourceType } from '@/lib/analytics/analytics-oauth-picker';

// Google OAuth 2.0 configuration
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Initiates a Google OAuth 2.0 flow for an analytics source (read-only)
 * GET /api/analytics/oauth/ga4?brandId=xxx
 * GET /api/analytics/oauth/search_console?brandId=xxx
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ source: string }> }
) {
    try {
        const sourceType = parseAnalyticsSourceType((await params).source);
        if (!sourceType) {
            return NextResponse.json({ error: 'Invalid analytics source' }, { status: 400 });
        }

        if (!ANALYTICS_GOOGLE_CLIENT_ID) {
            return NextResponse.json(
                { error: 'Google OAuth is not configured. Missing GOOGLE_CLIENT_ID.' },
                { status: 500 }
            );
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');

        if (!brandId) {
            return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
        }

        const state = crypto.randomBytes(16).toString('hex');

        const cookieStore = await cookies();
        const cookieNames = getAnalyticsOAuthCookieNames(sourceType);
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            maxAge: 600,
            path: '/',
        };

        cookieStore.set(cookieNames.state, state, cookieOptions);
        cookieStore.set(cookieNames.brandId, brandId, cookieOptions);

        const scopes = [
            sourceType === 'ga4' ? GA4_SCOPE : SEARCH_CONSOLE_SCOPE,
            'openid',
            'profile',
        ];

        const authUrl = new URL(GOOGLE_AUTH_URL);
        authUrl.searchParams.set('client_id', ANALYTICS_GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/analytics/oauth/${sourceType}/callback`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', scopes.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('access_type', 'offline'); // Request refresh token
        authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

        return NextResponse.redirect(authUrl.toString());
    } catch (error) {
        console.error('Analytics source OAuth initiation error:', error);
        return NextResponse.json({ error: 'Failed to initiate analytics OAuth flow' }, { status: 500 });
    }
}
