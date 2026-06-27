/**
 * X (Twitter) — OAuth2 + PKCE (S256), Basic-auth token exchange against the
 * api.x.com token endpoint. Scopes + callback/result URLs come from the shared
 * x-oauth helpers (they honor X_OAUTH_APP_URL / X_OAUTH_INCLUDE_MEDIA_WRITE).
 * Storage: SocialAccount keyed by X user id.
 * Migrated verbatim from the legacy /api/social/oauth/x routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import {
    getXOAuthCallbackUrl,
    getXOAuthResultUrl,
    getXOAuthScopes,
} from '@/lib/social/x-oauth';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

export const xPlatform: SocialOAuthPlatformConfig = {
    platform: 'x',
    clientIdEnv: 'NEXT_PUBLIC_X_CLIENT_ID',
    clientSecretEnv: 'X_CLIENT_SECRET',
    scopes: () => getXOAuthScopes(process.env),
    scopeSeparator: ' ',
    authUrl: 'https://x.com/i/oauth2/authorize',
    pkce: true,
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    tokenAuthMethod: 'basic',
    tokenBodyFormat: 'form',

    redirectUriOverride() {
        return getXOAuthCallbackUrl(process.env);
    },

    async persist(tokens, ctx) {
        // Fetch user info
        const userResponse = await fetch('https://api.x.com/2/users/me', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });

        if (!userResponse.ok) {
            const errText = await userResponse.text();
            throw new Error(`Failed to fetch user information: ${errText}`);
        }

        const userData = (await userResponse.json()) as {
            data?: {
                id: string;
                username?: string;
                name?: string;
                profile_image_url?: string;
            };
        };
        const user = userData.data;
        if (!user?.id) {
            throw new Error('X: user response had no id');
        }

        // Check if account already connected to another brand
        const existing = await socialAccountRepository.findByPlatformAccountId('x', user.id);
        if (existing && existing.brandId !== ctx.brandId) {
            throw new Error('This X account is already connected to another brand');
        }

        const scopes = getXOAuthScopes(process.env);

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
                platform: 'x',
                platformAccountId: user.id,
                platformUsername: user.username,
                platformDisplayName: user.name,
                avatarUrl: user.profile_image_url,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt: expiresInToDate(tokens.expiresIn),
                scopes,
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        // Legacy redirected to the X result URL (full http URL → engine uses it as-is).
        return `${getXOAuthResultUrl(process.env)}?connected=x`;
    },
};
