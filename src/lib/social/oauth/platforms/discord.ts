/**
 * Discord — OAuth2 with bot install (permissions=3072: Send Messages + View
 * Channels). Storage: SocialAccount keyed by guild id (bot install) or user
 * id, with discordMetadata. Migrated verbatim from the legacy routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

export const discordPlatform: SocialOAuthPlatformConfig = {
    platform: 'discord',
    clientIdEnv: 'DISCORD_CLIENT_ID',
    clientSecretEnv: 'DISCORD_CLIENT_SECRET',
    scopes: ['identify', 'bot', 'guilds'],
    scopeSeparator: ' ',
    authUrl: 'https://discord.com/oauth2/authorize',
    extraAuthParams: { permissions: '3072' },
    tokenUrl: 'https://discord.com/api/oauth2/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        const guild = (tokens.raw as { guild?: { id: string; name: string } }).guild;

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!userResponse.ok) {
            throw new Error('Discord: user fetch failed');
        }
        const user = (await userResponse.json()) as {
            id: string;
            username: string;
            global_name?: string;
            avatar?: string;
        };

        // Bot installs key the account on the guild; plain OAuth keys on the user.
        const platformAccountId = guild ? guild.id : user.id;
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : undefined;

        const existing = await socialAccountRepository.findByPlatformAccountId('discord', platformAccountId);
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
                platform: 'discord',
                platformAccountId,
                platformUsername: user.username,
                platformDisplayName: user.global_name || user.username,
                avatarUrl,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt: expiresInToDate(tokens.expiresIn),
                discordMetadata: guild ? { guildId: guild.id, guildName: guild.name } : undefined,
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/settings?tab=connections&success=discord_connected';
    },
};
