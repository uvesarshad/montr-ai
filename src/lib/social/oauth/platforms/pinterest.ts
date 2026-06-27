/**
 * Pinterest — OAuth2, Basic-auth + form token exchange, comma-separated scopes.
 * Storage: SocialAccount keyed by Pinterest user id.
 * Migrated verbatim from the legacy /api/social/oauth/pinterest routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

export const pinterestPlatform: SocialOAuthPlatformConfig = {
    platform: 'pinterest',
    clientIdEnv: 'PINTEREST_APP_ID',
    clientSecretEnv: 'PINTEREST_APP_SECRET',
    scopes: ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'],
    scopeSeparator: ',',
    authUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    tokenAuthMethod: 'basic',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        // Fetch user info
        const userResponse = await fetch('https://api.pinterest.com/v5/user_account', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });

        let displayName = 'Pinterest User';
        let username = '';
        let avatarUrl = '';
        let accountId = '';

        if (userResponse.ok) {
            const userData = (await userResponse.json()) as {
                id?: string;
                username?: string;
                profile_image?: string;
            };
            displayName = userData.username || displayName;
            username = userData.username || '';
            avatarUrl = userData.profile_image || '';
            accountId = userData.id || '';
        }

        if (!accountId) {
            throw new Error('Pinterest: user fetch failed');
        }

        const existing = await socialAccountRepository.findByPlatformAccountId('pinterest', accountId);
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
                platform: 'pinterest',
                platformAccountId: accountId,
                platformUsername: username,
                platformDisplayName: displayName,
                avatarUrl,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt: expiresInToDate(tokens.expiresIn),
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/social/oauth-callback?connected=pinterest_connected';
    },
};
