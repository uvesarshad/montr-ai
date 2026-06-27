/**
 * Google Business Profile — Google OAuth2 (business.manage), offline access +
 * forced consent. Storage: SocialAccount keyed by the business account name
 * (falling back to the userinfo id). Best-effort fetch of the first business
 * account from mybusinessaccountmanagement; userinfo supplies the avatar +
 * fallback name. Uses the YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET app (the
 * legacy route shared the YouTube Google app). Migrated from the legacy
 * /api/social/oauth/google-business routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GBP_ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const GBP_BUSINESS_INFO_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';

/**
 * Best-effort discovery of the first Business Profile location for an account.
 * Publishing a localPost needs an `accounts/{account}/locations/{location}`
 * parent, so we resolve and store the FIRST location's resource name. If the
 * account has multiple locations we still take the first (a location-picker UI
 * is out of scope) and log a note. On quota/permission failure we return null
 * and let the publish flow surface a clear "reconnect" error.
 */
async function fetchFirstLocationName(
    accountResourceName: string,
    accessToken: string,
): Promise<string | null> {
    try {
        const url = new URL(`${GBP_BUSINESS_INFO_URL}/${accountResourceName}/locations`);
        url.searchParams.set('readMask', 'name,title');
        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
            console.log(`Could not fetch Business Profile locations (HTTP ${res.status}); persisting account without a location.`);
            return null;
        }
        const data = (await res.json()) as {
            locations?: Array<{ name?: string; title?: string }>;
        };
        const locations = data.locations || [];
        if (locations.length === 0) {
            console.log('Google Business account has no locations; persisting account without a location.');
            return null;
        }
        if (locations.length > 1) {
            console.log(
                `Google Business account has ${locations.length} locations; storing the first ("${locations[0].title || locations[0].name}"). A location picker is out of scope.`,
            );
        }
        // The location `name` from business information is a bare `locations/{id}`;
        // localPosts needs the full `accounts/{account}/locations/{id}` parent.
        const locationName = locations[0].name;
        if (!locationName) return null;
        return locationName.startsWith('accounts/')
            ? locationName
            : `${accountResourceName}/${locationName}`;
    } catch {
        console.log('Could not fetch Business Profile locations (network/parse error); persisting account without a location.');
        return null;
    }
}

export const googleBusinessPlatform: SocialOAuthPlatformConfig = {
    platform: 'google-business',
    clientIdEnv: 'YOUTUBE_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_CLIENT_SECRET',
    scopes: [
        'https://www.googleapis.com/auth/business.manage',
        'openid',
        'profile',
        'email',
    ],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    tokenUrl: 'https://oauth2.googleapis.com/token',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',

    async persist(tokens, ctx) {
        // Fetch user info (best-effort — supplies avatar + fallback name/id).
        const userResponse = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const userData = (userResponse.ok
            ? await userResponse.json()
            : {}) as { id?: string; name?: string; picture?: string };

        // Best-effort fetch of the first business account.
        let businessAccount: { name?: string; accountName?: string } | null = null;
        try {
            const accountsResponse = await fetch(GBP_ACCOUNTS_URL, {
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (accountsResponse.ok) {
                const accountsData = (await accountsResponse.json()) as {
                    accounts?: Array<{ name?: string; accountName?: string }>;
                };
                businessAccount = accountsData.accounts?.[0] || null;
            }
        } catch {
            console.log('Could not fetch business accounts, using user info instead');
        }

        const accountId = businessAccount?.name || userData.id;
        const accountName = businessAccount?.accountName || userData.name || 'Google Business';

        if (!accountId) {
            throw new Error('Could not identify Google Business account');
        }

        const existingAccount = await socialAccountRepository.findByPlatformAccountId(
            'google_business',
            accountId
        );
        if (existingAccount && existingAccount.brandId !== ctx.brandId) {
            throw new Error('This Google Business account is already connected to another brand');
        }

        const tokenExpiresAt = expiresInToDate(tokens.expiresIn);

        // Resolve the first Business Profile location (needed as the localPosts
        // parent). Best-effort: a null result is persisted as "no location" and
        // surfaces a clear error at publish time. Only resolvable when we have a
        // real `accounts/{id}` resource name (not a userinfo id fallback).
        const locationName = businessAccount?.name
            ? await fetchFirstLocationName(businessAccount.name, tokens.accessToken)
            : null;

        if (existingAccount) {
            await socialAccountRepository.updateTokens(
                existingAccount._id.toString(),
                tokens.accessToken,
                tokens.refreshToken,
                tokenExpiresAt
            );
            if (locationName) {
                await socialAccountRepository.setMetadata(existingAccount._id.toString(), {
                    locationName,
                });
            }
        } else {
            const created = await socialAccountRepository.create({
                brandId: ctx.brandId,
                platform: 'google_business',
                platformAccountId: accountId,
                platformUsername: accountName.replace(/\s+/g, '').toLowerCase(),
                platformDisplayName: accountName,
                avatarUrl: userData.picture,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt,
                scopes: ['business.manage'],
            } as Parameters<typeof socialAccountRepository.create>[0]);
            if (locationName) {
                await socialAccountRepository.setMetadata(created._id.toString(), {
                    locationName,
                });
            }
        }

        return '/social/oauth-callback?connected=google_business';
    },
};
