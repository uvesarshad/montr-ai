/**
 * Notion — OAuth2, Basic-auth + JSON token exchange, owner=user.
 * Storage: SocialAccount keyed by workspace id, with notionMetadata.
 * Migrated verbatim from the legacy /api/social/oauth/notion routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import type { SocialOAuthPlatformConfig } from '../types';

export const notionPlatform: SocialOAuthPlatformConfig = {
    platform: 'notion',
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_CLIENT_SECRET',
    scopes: [], // Notion OAuth has no scope parameter
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    extraAuthParams: { owner: 'user' },
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    tokenAuthMethod: 'basic',
    tokenBodyFormat: 'json',

    async persist(tokens, ctx) {
        const raw = tokens.raw as {
            workspace_id?: string;
            workspace_name?: string;
            workspace_icon?: string;
            bot_id?: string;
            owner?: { user?: { avatar_url?: string } };
        };
        const workspaceId = raw.workspace_id;
        const workspaceName = raw.workspace_name || 'Notion Workspace';
        if (!workspaceId) {
            throw new Error('Notion: token response had no workspace_id');
        }

        const existing = await socialAccountRepository.findByPlatformAccountId('notion', workspaceId);
        if (existing) {
            await socialAccountRepository.updateTokens(existing._id.toString(), tokens.accessToken);
        } else {
            await socialAccountRepository.create({
                brandId: ctx.brandId,
                platform: 'notion',
                platformAccountId: workspaceId,
                platformUsername: workspaceName,
                platformDisplayName: workspaceName,
                avatarUrl: raw.workspace_icon || raw.owner?.user?.avatar_url || undefined,
                accessToken: tokens.accessToken,
                // Notion internal-integration tokens are long-lived; no refresh token.
                notionMetadata: {
                    workspaceId,
                    workspaceName,
                    botId: raw.bot_id || '',
                },
            } as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/settings?tab=connections&success=notion_connected';
    },
};
