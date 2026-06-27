/**
 * Google Drive — Google OAuth2 (drive.file + userinfo), offline access +
 * forced consent. Storage: userStorageRepository (per-user storage provider),
 * with the account email/name from userinfo and the used/quota bytes from
 * drive/v3/about?fields=user,storageQuota. Migrated from the legacy
 * /api/social/oauth/google-drive routes.
 *
 * NOTE: the legacy routes used `GOOGLE_DRIVE_CLIENT_ID || GOOGLE_CLIENT_ID`
 * (and the matching secret) as a fallback. The shared engine resolves a single
 * env var name, so this config declares the dedicated GOOGLE_DRIVE_* app; the
 * implicit fallback to the generic GOOGLE_CLIENT_ID is NOT reproduced here.
 */

import { userStorageRepository } from '@/lib/db/repository/user-storage.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

const GOOGLE_USER_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_DRIVE_ABOUT_URL =
    'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota';

export const googleDrivePlatform: SocialOAuthPlatformConfig = {
    platform: 'google-drive',
    clientIdEnv: 'GOOGLE_DRIVE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_DRIVE_CLIENT_SECRET',
    scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    tokenUrl: 'https://oauth2.googleapis.com/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        // Fetch user info (best-effort — supplies email + display name).
        const userResponse = await fetch(GOOGLE_USER_URL, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });

        let accountEmail = '';
        let accountName = 'Google Drive';
        if (userResponse.ok) {
            const userData = (await userResponse.json()) as { email?: string; name?: string };
            accountEmail = userData.email || '';
            accountName = userData.name || 'Google Drive';
        }

        // Fetch Drive storage quota (best-effort).
        let usedBytes = 0;
        let quotaBytes = 0;
        const driveResponse = await fetch(GOOGLE_DRIVE_ABOUT_URL, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (driveResponse.ok) {
            const driveData = (await driveResponse.json()) as {
                storageQuota?: { usage?: string; limit?: string };
            };
            usedBytes = parseInt(driveData.storageQuota?.usage || '') || 0;
            quotaBytes = parseInt(driveData.storageQuota?.limit || '') || 0;
        }

        await userStorageRepository.create({
            userId: ctx.userId,
            brandId: ctx.brandId,
            provider: 'google-drive',
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || '',
            tokenExpiresAt: expiresInToDate(tokens.expiresIn) || new Date(),
            accountEmail,
            accountName,
            usedBytes,
            quotaBytes,
        });

        return '/social/oauth-callback?connected=google_drive_connected';
    },
};
