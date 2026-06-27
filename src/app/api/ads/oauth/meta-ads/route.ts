import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getMetaAdsOAuthCookieNames, META_ADS_GRAPH_VERSION } from '@/lib/ads/meta-ads-oauth';

// Meta (Marketing API) OAuth 2.0 configuration — same Meta app as the social module
const META_AUTH_URL = `https://www.facebook.com/${META_ADS_GRAPH_VERSION}/dialog/oauth`;
const FACEBOOK_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/oauth/meta-ads/callback`;

// ads_read covers insights (M1); ads_management is needed for the
// create-only campaign wizard (M3) — campaigns are always created PAUSED
// and never mutated automatically (see docs/ads-analytics-plan.md).
const SCOPES = [
    'ads_read',
    'ads_management',
    'business_management',
];

/**
 * Initiates Meta Ads OAuth 2.0 flow
 * GET /api/ads/oauth/meta-ads?brandId=xxx
 */
export async function GET(request: NextRequest) {
    try {
        if (!FACEBOOK_APP_ID) {
            return NextResponse.json(
                { error: 'Meta Ads OAuth is not configured. Missing NEXT_PUBLIC_FACEBOOK_APP_ID.' },
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
        const cookieNames = getMetaAdsOAuthCookieNames();
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            maxAge: 600,
            path: '/',
        };

        cookieStore.set(cookieNames.state, state, cookieOptions);
        cookieStore.set(cookieNames.brandId, brandId, cookieOptions);

        const authUrl = new URL(META_AUTH_URL);
        authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('scope', SCOPES.join(','));
        authUrl.searchParams.set('response_type', 'code');

        return NextResponse.redirect(authUrl.toString());
    } catch (error) {
        console.error('Meta Ads OAuth initiation error:', error);
        return NextResponse.json({ error: 'Failed to initiate Meta Ads OAuth flow' }, { status: 500 });
    }
}
