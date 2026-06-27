/**
 * Facebook — 2-step Meta flow. The callback exchanges the code for a USER
 * access token (client credentials in the body), then does NOT create a
 * SocialAccount. Instead it stashes the user token + brandId in the Meta
 * handoff cookies and redirects to the asset selector, where the user picks a
 * Page. The /api/social/oauth/meta/select route reads those cookies, so their
 * names MUST match getMetaOAuthCookieNames('facebook').
 * Migrated verbatim from the legacy /api/social/oauth/facebook routes.
 */

import { getMetaOAuthCookieNames } from '@/lib/social/meta-oauth';
import type { SocialOAuthPlatformConfig } from '../types';

export const facebookPlatform: SocialOAuthPlatformConfig = {
    platform: 'facebook',
    clientIdEnv: 'NEXT_PUBLIC_FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
    scopes: [
        'pages_show_list',    // List user's pages
        'pages_read_engagement',
        'pages_manage_posts', // Post to pages
        'public_profile',
    ],
    scopeSeparator: ',',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',
    tokenMethod: 'GET', // Meta legacy wire format: creds in query string

    async persist(tokens, ctx) {
        const cookieNames = getMetaOAuthCookieNames('facebook');
        return {
            redirect: '/social/oauth-callback?meta=select&platform=facebook',
            cookies: [
                { name: cookieNames.userToken, value: tokens.accessToken, maxAge: 600 },
                { name: cookieNames.brandId, value: ctx.brandId, maxAge: 600 },
            ],
        };
    },
};
