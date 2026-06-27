/**
 * Outlook Calendar (Microsoft Graph) — OAuth2 for CRM Calendar Sync.
 * Storage: CRM calendar account (calendarAccountRepository), scoped to org.
 * Microsoft authorize/token URLs, response_mode=query, prompt=consent.
 * Migrated verbatim from the legacy /api/social/oauth/outlook-calendar routes.
 */

import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

export const outlookCalendarPlatform: SocialOAuthPlatformConfig = {
    platform: 'outlook-calendar',
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    scopes: [
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/User.Read',
        'offline_access',
    ],
    scopeSeparator: ' ',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    extraAuthParams: { response_mode: 'query', prompt: 'consent' },
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!userResponse.ok) {
            throw new Error('Outlook Calendar: failed to fetch user');
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
            throw new Error('Outlook Calendar: user has no organization');
        }
        const oauth = {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: expiresInToDate(tokens.expiresIn),
            scope: tokens.raw.scope as string | undefined,
        };

        const existingAccount = await calendarAccountRepository.findByEmail(email);
        if (existingAccount && existingAccount.provider === 'outlook') {
            await calendarAccountRepository.updateOAuth(
                existingAccount._id.toString(),
                oauth as Parameters<typeof calendarAccountRepository.updateOAuth>[1]
            );
        } else {
            await calendarAccountRepository.create({
                userId: ctx.userId,
                email,
                displayName,
                provider: 'outlook',
                oauth: oauth as Parameters<typeof calendarAccountRepository.create>[0]['oauth'],
                calendars: [],
                syncDirection: 'one_way',
                autoLinkContacts: true,
            });
        }

        return '/social/oauth-callback?connected=outlook_calendar_connected';
    },
};
