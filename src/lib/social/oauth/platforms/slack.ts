/**
 * Slack — OAuth v2 (oauth.v2.access). Slack returns HTTP 200 with
 * `{ ok: false, error }` on failure and nests its success payload:
 * `access_token` (top-level) is the BOT token; `team`, `bot_user_id`,
 * `incoming_webhook` carry the connection metadata. Scopes are comma-joined;
 * the authoring user scope rides as `user_scope`.
 * Storage: SocialAccount keyed by team id, with slackMetadata.
 * Migrated verbatim from the legacy /api/social/oauth/slack routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

const SCOPES = ['chat:write', 'channels:read', 'groups:read', 'im:read', 'mpim:read', 'files:write'];
const USER_SCOPES = ['identify'];

export const slackPlatform: SocialOAuthPlatformConfig = {
    platform: 'slack',
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    scopes: SCOPES,
    scopeSeparator: ',',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    extraAuthParams: { user_scope: USER_SCOPES.join(',') },
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        const raw = tokens.raw as {
            ok?: boolean;
            error?: string;
            team?: { id: string; name: string };
            bot_user_id?: string;
            incoming_webhook?: { url?: string };
        };

        // Slack signals failure with HTTP 200 + { ok: false, error }.
        if (raw.ok === false) {
            console.error('Slack token exchange error:', raw.error);
            throw new Error(`Slack: token exchange failed — ${raw.error || 'unknown_error'}`);
        }

        const team = raw.team;
        if (!team?.id) {
            throw new Error('Slack: token response had no team');
        }

        const tokenExpiresAt = expiresInToDate(tokens.expiresIn);
        const slackMetadata = {
            teamId: team.id,
            teamName: team.name,
            botUserId: raw.bot_user_id,
            incomingWebhookUrl: raw.incoming_webhook?.url,
        };

        const existingAccount = await socialAccountRepository.findByPlatformAccountId('slack', team.id);

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
                platform: 'slack',
                platformAccountId: team.id,
                platformUsername: team.name,
                platformDisplayName: team.name,
                avatarUrl: null,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt,
                slackMetadata,
            } as unknown as Parameters<typeof socialAccountRepository.create>[0]);
        }

        return '/settings?tab=connections&success=slack_connected';
    },
};
