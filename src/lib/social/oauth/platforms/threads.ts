/**
 * Threads — Meta-style OAuth via the Facebook dialog, comma-separated scopes.
 * Token exchange hits the Facebook Graph token endpoint (client credentials in
 * the body); profile comes from graph.threads.net. Tokens are stored as-is
 * (legacy did no long-lived-token exchange step — see migration notes).
 * Storage: SocialAccount keyed by Threads user id.
 * Migrated verbatim from the legacy /api/social/oauth/threads routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import type { SocialOAuthPlatformConfig } from '../types';

export const threadsPlatform: SocialOAuthPlatformConfig = {
    platform: 'threads',
    clientIdEnv: 'NEXT_PUBLIC_FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
    scopes: [
        'threads_basic',           // Basic Threads access
        'threads_content_publish', // Publish to Threads
        'threads_manage_insights', // View insights
        'threads_manage_replies',  // Manage replies
        'public_profile',
    ],
    scopeSeparator: ',',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',
    tokenMethod: 'GET', // Meta legacy wire format: creds in query string

    async persist(tokens, ctx) {
        // Fetch Threads user profile
        const userUrl = new URL('https://graph.threads.net/v1.0/me');
        userUrl.searchParams.set('fields', 'id,username,name,threads_profile_picture_url');
        userUrl.searchParams.set('access_token', tokens.accessToken);

        const userResponse = await fetch(userUrl.toString());
        if (!userResponse.ok) {
            throw new Error('Threads: user fetch failed');
        }

        const userData = (await userResponse.json()) as {
            id: string;
            username?: string;
            name?: string;
            threads_profile_picture_url?: string;
        };

        // Check if already connected
        const existing = await socialAccountRepository.findByPlatformAccountId('threads', userData.id);
        if (existing && existing.brandId !== ctx.brandId) {
            throw new Error('This Threads account is already connected to another brand');
        }

        if (existing) {
            await socialAccountRepository.updateTokens(
                existing._id.toString(),
                tokens.accessToken,
                undefined,
                undefined
            );
        } else {
            await socialAccountRepository.create({
                brandId: ctx.brandId,
                platform: 'threads',
                platformAccountId: userData.id,
                platformUsername: userData.username,
                platformDisplayName: userData.name || userData.username,
                avatarUrl: userData.threads_profile_picture_url,
                accessToken: tokens.accessToken,
                scopes: ['threads_basic', 'threads_content_publish'],
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/social/oauth-callback?connected=threads';
    },
};
