/**
 * Google Calendar — Google OAuth2 (calendar.readonly + calendar.events +
 * userinfo), offline access + forced consent for a refresh token. Storage:
 * calendarAccountRepository (CRM, scoped to the session user's organization).
 * An existing same-email account is only updated when its provider is already
 * 'google'; otherwise a new google account is created. Migrated from the legacy
 * /api/social/oauth/google-calendar routes.
 */

import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

const GOOGLE_USER_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const googleCalendarPlatform: SocialOAuthPlatformConfig = {
    platform: 'google-calendar',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    scopes: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    tokenUrl: 'https://oauth2.googleapis.com/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
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
        const oauth = {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || '',
            expiresAt: expiresInToDate(tokens.expiresIn),
            scope: tokens.scopes?.join(' '),
        };

        const existingAccount = await calendarAccountRepository.findByEmail(email);
        if (existingAccount && existingAccount.provider === 'google') {
            await calendarAccountRepository.updateOAuth(
                existingAccount._id.toString(),
                oauth
            );
        } else {
            await calendarAccountRepository.create({
                userId: ctx.userId,
                email,
                displayName,
                provider: 'google',
                oauth,
                calendars: [],
                syncDirection: 'one_way',
                autoLinkContacts: true,
            });
        }

        return '/social/oauth-callback?connected=google_calendar_connected';
    },
};
