/**
 * Dribbble — OAuth2, client credentials in the token body, space-separated
 * scopes. Tokens are long-lived (no refresh token / expiry returned).
 * Storage: SocialAccount keyed by Dribbble user id.
 * Migrated verbatim from the legacy /api/social/oauth/dribbble routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import type { SocialOAuthPlatformConfig } from '../types';

export const dribbblePlatform: SocialOAuthPlatformConfig = {
    platform: 'dribbble',
    clientIdEnv: 'NEXT_PUBLIC_DRIBBBLE_CLIENT_ID',
    clientSecretEnv: 'DRIBBBLE_CLIENT_SECRET',
    scopes: ['public', 'upload'],
    scopeSeparator: ' ',
    authUrl: 'https://dribbble.com/oauth/authorize',
    tokenUrl: 'https://dribbble.com/oauth/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        // Fetch user info
        const userResponse = await fetch('https://api.dribbble.com/v2/user', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });

        if (!userResponse.ok) {
            throw new Error('Dribbble: user fetch failed');
        }

        const userData = (await userResponse.json()) as {
            id: number | string;
            login?: string;
            name?: string;
            avatar_url?: string;
        };

        // Check if already connected
        const existing = await socialAccountRepository.findByPlatformAccountId('dribbble', String(userData.id));
        if (existing && existing.brandId !== ctx.brandId) {
            throw new Error('This Dribbble account is already connected to another brand');
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
                platform: 'dribbble',
                platformAccountId: String(userData.id),
                platformUsername: userData.login || userData.name,
                platformDisplayName: userData.name,
                avatarUrl: userData.avatar_url,
                accessToken: tokens.accessToken,
                scopes: ['public', 'upload'],
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/social/oauth-callback?connected=dribbble';
    },
};
