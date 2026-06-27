/**
 * YouTube — Google OAuth2 (youtube.* scopes), offline access + forced consent
 * for a refresh token. Storage: SocialAccount keyed by channel id, with the
 * channel snippet fetched from youtube/v3/channels?mine=true. Uses the
 * YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET app (distinct from the CRM Google
 * app). Migrated from the legacy /api/social/oauth/youtube routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

export const youtubePlatform: SocialOAuthPlatformConfig = {
    platform: 'youtube',
    clientIdEnv: 'YOUTUBE_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_CLIENT_SECRET',
    scopes: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'openid',
        'profile',
    ],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    tokenUrl: 'https://oauth2.googleapis.com/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
        channelUrl.searchParams.set('part', 'snippet,statistics');
        channelUrl.searchParams.set('mine', 'true');

        const channelResponse = await fetch(channelUrl.toString(), {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!channelResponse.ok) {
            throw new Error('Failed to fetch YouTube channel');
        }

        const channelData = (await channelResponse.json()) as {
            items?: Array<{
                id: string;
                snippet: {
                    title: string;
                    customUrl?: string;
                    thumbnails?: { default?: { url?: string } };
                };
            }>;
        };
        const channel = channelData.items?.[0];
        if (!channel) {
            throw new Error('No YouTube channel found for this account');
        }

        const existingAccount = await socialAccountRepository.findByPlatformAccountId('youtube', channel.id);
        if (existingAccount && existingAccount.brandId !== ctx.brandId) {
            throw new Error('This YouTube channel is already connected to another brand');
        }

        const tokenExpiresAt = expiresInToDate(tokens.expiresIn);

        if (existingAccount) {
            await socialAccountRepository.updateTokens(
                existingAccount._id.toString(),
                tokens.accessToken,
                tokens.refreshToken,
                tokenExpiresAt
            );
        } else {
            await socialAccountRepository.create({
                brandId: ctx.brandId,
                platform: 'youtube',
                platformAccountId: channel.id,
                platformUsername: channel.snippet.customUrl || channel.snippet.title,
                platformDisplayName: channel.snippet.title,
                avatarUrl: channel.snippet.thumbnails?.default?.url,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt,
                scopes: ['youtube.readonly', 'youtube.upload'],
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/social/oauth-callback?connected=youtube';
    },
};
