/**
 * Gmail — Google OAuth2, offline access + forced consent for a refresh token.
 * Dual storage: when the initiate request carried ?source=crm the connection
 * is stored as a CRM email account (emailAccountRepository, scoped to the
 * session user's organization); otherwise it is NOT a social account here —
 * the legacy gmail flow only ever wrote CRM email accounts, branching the
 * success/error redirects on `source`. Migrated from the legacy
 * /api/social/oauth/gmail routes.
 */

import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

const GOOGLE_USER_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const gmailPlatform: SocialOAuthPlatformConfig = {
    platform: 'gmail',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    tokenUrl: 'https://oauth2.googleapis.com/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',
    passthroughParams: ['source'],

    // CRM email connect runs brand-less (?source=crm only).
    allowMissingBrand(extra) {
        return extra.source === 'crm';
    },

    // CRM path keeps its own settings redirect; social path uses the popup page.
    errorRedirect(code, extra) {
        return extra?.source === 'crm'
            ? `/settings?tab=connections&error=${encodeURIComponent(code)}`
            : `/social/oauth-callback?error=${encodeURIComponent(code)}`;
    },

    async persist(tokens, ctx) {
        const isCrm = ctx.extra.source === 'crm';
        const successUrl = isCrm
            ? '/settings?tab=connections&success=gmail_connected'
            : '/social/oauth-callback?connected=gmail_connected';

        const userResponse = await fetch(GOOGLE_USER_URL, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!userResponse.ok) {
            throw new Error('failed_to_fetch_user');
        }
        const userData = (await userResponse.json()) as { email?: string; name?: string };
        const email = userData.email || '';
        const displayName = userData.name || '';

        const user = await userRepository.findById(ctx.userId);
        if (!user) {
            throw new Error('no_organization');
        }
        const scope = tokens.scopes?.join(' ');

        const oauth = {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || '',
            expiresAt: expiresInToDate(tokens.expiresIn),
            scope,
        };

        const existingAccount = await emailAccountRepository.findByEmail(email);
        if (existingAccount) {
            await emailAccountRepository.updateOAuth(existingAccount._id.toString(), oauth);
        } else {
            await emailAccountRepository.create({
                userId: ctx.userId,
                email,
                displayName,
                provider: 'gmail',
                oauth,
                syncFolders: ['INBOX', 'Sent'],
                autoLinkContacts: true,
            });
        }

        return successUrl;
    },
};
