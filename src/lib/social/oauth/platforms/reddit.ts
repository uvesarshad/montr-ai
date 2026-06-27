/**
 * Reddit — OAuth2, Basic-auth + form token exchange, space-separated scopes,
 * duration=permanent (for a refresh token), and a required User-Agent header
 * on both the token and identity requests.
 * Storage: SocialAccount keyed by Reddit user id.
 * Migrated verbatim from the legacy /api/social/oauth/reddit routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

export const redditPlatform: SocialOAuthPlatformConfig = {
    platform: 'reddit',
    clientIdEnv: 'NEXT_PUBLIC_REDDIT_CLIENT_ID',
    clientSecretEnv: 'REDDIT_CLIENT_SECRET',
    scopes: ['identity', 'submit', 'read'],
    scopeSeparator: ' ',
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    extraAuthParams: { duration: 'permanent' },
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    tokenAuthMethod: 'basic',
    tokenBodyFormat: 'form',
    tokenExtraHeaders: { 'User-Agent': 'Montr/1.0' },

    async persist(tokens, ctx) {
        // Fetch user info
        const userResponse = await fetch('https://oauth.reddit.com/api/v1/me', {
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                'User-Agent': 'Montr/1.0',
            },
        });

        if (!userResponse.ok) {
            throw new Error('Reddit: user fetch failed');
        }

        const userData = (await userResponse.json()) as {
            id: string;
            name: string;
            subreddit?: { display_name_prefixed?: string };
            icon_img?: string;
        };

        // Check if account already connected to another brand
        const existing = await socialAccountRepository.findByPlatformAccountId('reddit', userData.id);
        if (existing && existing.brandId !== ctx.brandId) {
            throw new Error('This Reddit account is already connected to another brand');
        }

        if (existing) {
            await socialAccountRepository.updateTokens(
                existing._id.toString(),
                tokens.accessToken,
                tokens.refreshToken,
                expiresInToDate(tokens.expiresIn)
            );
        } else {
            await socialAccountRepository.create({
                brandId: ctx.brandId,
                platform: 'reddit',
                platformAccountId: userData.id,
                platformUsername: userData.name,
                platformDisplayName: userData.subreddit?.display_name_prefixed || userData.name,
                avatarUrl: userData.icon_img?.split('?')[0], // Remove query params
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt: expiresInToDate(tokens.expiresIn),
                scopes: ['identity', 'submit', 'read'],
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/social/oauth-callback?connected=reddit';
    },
};
