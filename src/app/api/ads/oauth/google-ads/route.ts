import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import {
    getGoogleAdsOAuthCookieNames,
    GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_DEVELOPER_TOKEN,
    GOOGLE_ADS_SCOPE,
} from '@/lib/ads/google-ads-oauth';

// Google OAuth 2.0 configuration
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/oauth/google-ads/callback`;

const SCOPES = [
    GOOGLE_ADS_SCOPE, // https://www.googleapis.com/auth/adwords
    'openid',
    'profile',
];

/**
 * Initiates Google Ads OAuth 2.0 flow
 * GET /api/ads/oauth/google-ads?brandId=xxx
 */
export async function GET(request: NextRequest) {
    try {
        if (!GOOGLE_ADS_CLIENT_ID) {
            return NextResponse.json(
                { error: 'Google Ads OAuth is not configured. Missing GOOGLE_ADS_CLIENT_ID / GOOGLE_CLIENT_ID.' },
                { status: 500 }
            );
        }
        if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
            return NextResponse.json(
                { error: 'Google Ads is not configured. Missing GOOGLE_ADS_DEVELOPER_TOKEN.' },
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
        const cookieNames = getGoogleAdsOAuthCookieNames();
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            maxAge: 600,
            path: '/',
        };

        cookieStore.set(cookieNames.state, state, cookieOptions);
        cookieStore.set(cookieNames.brandId, brandId, cookieOptions);

        const authUrl = new URL(GOOGLE_AUTH_URL);
        authUrl.searchParams.set('client_id', GOOGLE_ADS_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', SCOPES.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('access_type', 'offline'); // Request refresh token
        authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

        return NextResponse.redirect(authUrl.toString());
    } catch (error) {
        console.error('Google Ads OAuth initiation error:', error);
        return NextResponse.json({ error: 'Failed to initiate Google Ads OAuth flow' }, { status: 500 });
    }
}
