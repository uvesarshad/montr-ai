/**
 * TikTok — OAuth2 + PKCE (S256), comma-separated scopes. TikTok uses
 * `client_key` instead of `client_id` in both the auth URL and the token body
 * (clientIdParamName). The account id (open_id) comes from the token response.
 * Storage: SocialAccount keyed by open_id.
 * Migrated verbatim from the legacy /api/social/oauth/tiktok routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import type { SocialPlatform } from '@/lib/db/models/social-account.model';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

// 'tiktok' is not (yet) in the SocialPlatform union; the legacy routes
// suppressed the same gap with ts directives. Cast at the call sites instead.
const TIKTOK_PLATFORM = 'tiktok' as SocialPlatform;

export const tiktokPlatform: SocialOAuthPlatformConfig = {
    platform: 'tiktok',
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    scopes: ['user.info.basic', 'video.upload', 'video.publish'],
    scopeSeparator: ',',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    pkce: true,
    clientIdParamName: 'client_key',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        const openId = (tokens.raw as { open_id?: string }).open_id;
        if (!openId) {
            throw new Error('TikTok: token response had no open_id');
        }

        // Fetch user info
        const userResponse = await fetch(
            'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
            {
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
            }
        );

        let displayName = 'TikTok User';
        let avatarUrl = '';
        let username: string = openId;

        if (userResponse.ok) {
            const userData = (await userResponse.json()) as {
                data?: { user?: { display_name?: string; avatar_url?: string } };
            };
            if (userData.data?.user) {
                displayName = userData.data.user.display_name || displayName;
                avatarUrl = userData.data.user.avatar_url || '';
                username = userData.data.user.display_name || username;
            }
        }

        // TikTok Business apps return advertiser_ids on the token response; the
        // analytics fetcher needs an advertiser_id (audit C7). Consumer-only
        // grants won't include it — in that case it's simply not stored and the
        // fetcher degrades gracefully.
        const raw = tokens.raw as { advertiser_ids?: unknown };
        let advertiserId: string | undefined;
        if (Array.isArray(raw.advertiser_ids) && raw.advertiser_ids.length > 0) {
            const first = raw.advertiser_ids[0];
            if (typeof first === 'string' || typeof first === 'number') {
                advertiserId = String(first);
            }
        }

        const existing = await socialAccountRepository.findByPlatformAccountId(TIKTOK_PLATFORM, openId);
        if (existing) {
            await socialAccountRepository.updateTokens(
                existing._id.toString(),
                tokens.accessToken,
                tokens.refreshToken,
                expiresInToDate(tokens.expiresIn)
            );
            if (advertiserId) {
                await socialAccountRepository.setMetadata(existing._id.toString(), { advertiserId });
            }
        } else {
            const created = await socialAccountRepository.create({
                brandId: ctx.brandId,
                platform: TIKTOK_PLATFORM,
                platformAccountId: openId,
                platformUsername: username,
                platformDisplayName: displayName,
                avatarUrl,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt: expiresInToDate(tokens.expiresIn),
            } as Parameters<typeof socialAccountRepository.create>[0]);
            if (advertiserId) {
                await socialAccountRepository.setMetadata(created._id.toString(), { advertiserId });
            }
        }

        return '/social/oauth-callback?connected=tiktok_connected';
    },
};
