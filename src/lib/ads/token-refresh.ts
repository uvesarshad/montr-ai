/**
 * Token refresh for ad accounts and analytics sources.
 *
 * Every fetcher MUST obtain tokens through getFreshAdAccountToken /
 * getFreshAnalyticsSourceToken instead of reading the repository directly —
 * Google access tokens live ~1 hour, Meta long-lived user tokens ~60 days.
 *
 * - google_ads / ga4 / search_console: standard Google refresh-token grant.
 * - meta_ads: re-exchange the current long-lived token for a new one while
 *   it is still valid; once fully expired the user must reconnect.
 */
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';
import type { IAdAccount } from '@/lib/db/models/ad-account.model';
import type { IAnalyticsSource } from '@/lib/db/models/analytics-source.model';
import { exchangeForLongLivedToken } from '@/lib/ads/meta-ads-oauth';
import { GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET } from '@/lib/ads/google-ads-oauth';
import {
    ANALYTICS_GOOGLE_CLIENT_ID,
    ANALYTICS_GOOGLE_CLIENT_SECRET,
} from '@/lib/analytics/analytics-oauth';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Refresh when within 5 minutes of expiry (matches repository.needsRefresh)
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function isFresh(expiresAt?: Date | null): boolean {
    if (!expiresAt) return true; // No recorded expiry — assume usable
    return expiresAt.getTime() > Date.now() + REFRESH_MARGIN_MS;
}

async function refreshGoogleAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) {
        throw new Error(`Google token refresh failed: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        accessToken: data.access_token as string,
        expiresAt: new Date(Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000)),
    };
}

/**
 * Returns a usable access token for an ad account, refreshing it first if
 * it is at/near expiry. Throws if the credentials can no longer be
 * refreshed (the error is also recorded on the account).
 */
export async function getFreshAdAccountToken(accountId: string): Promise<{ accessToken: string; account: IAdAccount }> {
    const decrypted = await adAccountRepository.findByIdWithTokens(accountId);
    if (!decrypted) {
        throw new Error(`Ad account ${accountId} not found`);
    }

    const { account, accessToken, refreshToken } = decrypted;

    if (isFresh(account.tokenExpiresAt)) {
        return { accessToken, account };
    }

    try {
        if (account.platform === 'google_ads') {
            if (!refreshToken) {
                throw new Error('Missing refresh token — please reconnect the account');
            }
            if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET) {
                throw new Error('Google Ads OAuth is not configured');
            }
            const refreshed = await refreshGoogleAccessToken(refreshToken, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET);
            await adAccountRepository.updateTokens(accountId, refreshed.accessToken, undefined, refreshed.expiresAt);
            return { accessToken: refreshed.accessToken, account };
        }

        // meta_ads — re-exchange the long-lived token while it is still valid
        const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        if (!appId || !appSecret) {
            throw new Error('Meta Ads OAuth is not configured');
        }
        const exchanged = await exchangeForLongLivedToken(accessToken, appId, appSecret);
        const expiresAt = exchanged.expiresAt || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        await adAccountRepository.updateTokens(accountId, exchanged.accessToken, undefined, expiresAt);
        return { accessToken: exchanged.accessToken, account };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Token refresh failed';
        await adAccountRepository.recordError(accountId, message);
        throw error;
    }
}

/**
 * Returns a usable access token for an analytics source (GA4 / Search
 * Console), refreshing it first if it is at/near expiry.
 */
export async function getFreshAnalyticsSourceToken(sourceId: string): Promise<{ accessToken: string; source: IAnalyticsSource }> {
    const decrypted = await analyticsSourceRepository.findByIdWithTokens(sourceId);
    if (!decrypted) {
        throw new Error(`Analytics source ${sourceId} not found`);
    }

    const { source, accessToken, refreshToken } = decrypted;

    if (isFresh(source.tokenExpiresAt)) {
        return { accessToken, source };
    }

    try {
        if (!refreshToken) {
            throw new Error('Missing refresh token — please reconnect the source');
        }
        if (!ANALYTICS_GOOGLE_CLIENT_ID || !ANALYTICS_GOOGLE_CLIENT_SECRET) {
            throw new Error('Google OAuth is not configured');
        }
        const refreshed = await refreshGoogleAccessToken(refreshToken, ANALYTICS_GOOGLE_CLIENT_ID, ANALYTICS_GOOGLE_CLIENT_SECRET);
        await analyticsSourceRepository.updateTokens(sourceId, refreshed.accessToken, undefined, refreshed.expiresAt);
        return { accessToken: refreshed.accessToken, source };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Token refresh failed';
        await analyticsSourceRepository.recordError(sourceId, message);
        throw error;
    }
}
