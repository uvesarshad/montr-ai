/**
 * Outlook (Microsoft Graph Mail) — OAuth2, dual-path storage:
 *   source=crm  → CRM email account (emailAccountRepository), scoped to org
 *   default     → (social path) — legacy only ever persisted the CRM email
 *                 account; the social branch shares the same persist + a
 *                 different success redirect.
 * Microsoft authorize/token URLs, response_mode=query, prompt=consent.
 * Migrated verbatim from the legacy /api/social/oauth/outlook routes.
 */

import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

export const outlookPlatform: SocialOAuthPlatformConfig = {
    platform: 'outlook',
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    scopes: [
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/User.Read',
        'offline_access',
    ],
    scopeSeparator: ' ',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    extraAuthParams: { response_mode: 'query', prompt: 'consent' },
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',
    passthroughParams: ['source'],

    // CRM email connect runs brand-less (?source=crm only).
    allowMissingBrand(extra) {
        return extra.source === 'crm';
    },

    // CRM-initiated flows surface errors on the settings page (legacy behavior);
    // social flows use the popup-closing page.
    errorRedirect(code, extra) {
        return extra?.source === 'crm'
            ? `/settings?tab=connections&error=${encodeURIComponent(code)}`
            : `/social/oauth-callback?error=${encodeURIComponent(code)}`;
    },

    async persist(tokens, ctx) {
        const isCrm = ctx.extra.source === 'crm';

        const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!userResponse.ok) {
            throw new Error('Outlook: failed to fetch user');
        }
        const userData = (await userResponse.json()) as {
            mail?: string;
            userPrincipalName?: string;
            displayName?: string;
        };
        const email = userData.mail || userData.userPrincipalName || '';
        const displayName = userData.displayName || '';

        const user = await userRepository.findById(ctx.userId);
        if (!user) {
            throw new Error('Outlook: user has no organization');
        }
        const oauth = {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: expiresInToDate(tokens.expiresIn),
            scope: tokens.raw.scope as string | undefined,
        };

        const existingAccount = await emailAccountRepository.findByEmail(email);
        if (existingAccount) {
            await emailAccountRepository.updateOAuth(
                existingAccount._id.toString(),
                oauth as Parameters<typeof emailAccountRepository.updateOAuth>[1]
            );
        } else {
            await emailAccountRepository.create({
                userId: ctx.userId,
                email,
                displayName,
                provider: 'outlook',
                oauth: oauth as Parameters<typeof emailAccountRepository.create>[0]['oauth'],
                syncFolders: ['INBOX', 'Sent'],
                autoLinkContacts: true,
            });
        }

        return isCrm
            ? '/settings?tab=connections&success=outlook_connected'
            : '/social/oauth-callback?connected=outlook_connected';
    },
};
