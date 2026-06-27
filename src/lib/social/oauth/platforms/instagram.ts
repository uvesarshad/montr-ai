/**
 * Instagram — 2-step Meta flow via the Facebook dialog (Instagram Business /
 * Creator accounts are linked to Facebook Pages). The callback exchanges the
 * code for a USER access token, then does NOT create a SocialAccount; it stashes
 * the user token + brandId in the Meta handoff cookies and redirects to the
 * asset selector. The /api/social/oauth/meta/select route reads those cookies,
 * so their names MUST match getMetaOAuthCookieNames('instagram').
 * Migrated verbatim from the legacy /api/social/oauth/instagram routes.
 */

import { getMetaOAuthCookieNames } from '@/lib/social/meta-oauth';
import type { SocialOAuthPlatformConfig } from '../types';

export const instagramPlatform: SocialOAuthPlatformConfig = {
    platform: 'instagram',
    clientIdEnv: 'NEXT_PUBLIC_FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
    scopes: [
        'instagram_basic',           // Basic Instagram account info
        'instagram_content_publish', // Publish content
        'pages_show_list',           // Required to access linked pages
        'pages_read_engagement',
        'public_profile',
    ],
    scopeSeparator: ',',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',
    tokenMethod: 'GET', // Meta legacy wire format: creds in query string

    async persist(tokens, ctx) {
        const cookieNames = getMetaOAuthCookieNames('instagram');
        return {
            redirect: '/social/oauth-callback?meta=select&platform=instagram',
            cookies: [
                { name: cookieNames.userToken, value: tokens.accessToken, maxAge: 600 },
                { name: cookieNames.brandId, value: ctx.brandId, maxAge: 600 },
            ],
        };
    },
};
