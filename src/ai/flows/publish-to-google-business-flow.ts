'use server';

/**
 * Google Business Profile Publishing Flow
 *
 * Posts a "local post" to a Business Profile location via the legacy
 * My Business v4 API:
 *   POST https://mybusiness.googleapis.com/v4/{parent=accounts/*\/locations/*}/localPosts
 * with a STANDARD post body:
 *   { languageCode, summary, topicType: 'STANDARD', media: [{ mediaFormat, sourceUrl }] }
 *
 * The location parent (`accounts/{id}/locations/{id}`) is captured at connect
 * time and stored in `metadata.locationName`. If it is missing we surface a
 * clear "reconnect to select a location" error rather than guessing.
 *
 * Tokens: Google OAuth (business.manage) — access token (+ refresh token). On a
 * 401 we surface a clear "reconnect" error rather than retrying. Summary text is
 * capped at 1500 chars by the API; we reject over-long content up front.
 *
 * Media is pulled by Google from the public `sourceUrl` (https only), same model
 * as the other social flows — we do not upload the bytes ourselves.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const GBP_API_URL = 'https://mybusiness.googleapis.com/v4';
const MAX_SUMMARY_LENGTH = 1500;

interface GoogleBusinessPublishInput {
    accountId: string;
    content: string;
    /** Optional public https image URL to attach as a PHOTO. */
    imageUrl?: string;
}

interface GoogleBusinessPublishResult {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
}

export async function publishToGoogleBusiness(
    input: GoogleBusinessPublishInput,
): Promise<GoogleBusinessPublishResult> {
    try {
        const accountData = await socialAccountRepository.findByIdWithTokens(input.accountId);
        if (!accountData) {
            return { success: false, error: 'Google Business account not found. Please reconnect your Google Business account.' };
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'google_business') {
            return { success: false, error: 'Invalid account. This is not a Google Business account.' };
        }
        if (!accessToken) {
            return { success: false, error: 'Access token not found. Please reconnect your Google Business account.' };
        }

        const locationName = account.metadata?.locationName as string | undefined;
        if (!locationName) {
            return {
                success: false,
                error: 'No Business Profile location on this account — reconnect to select one.',
            };
        }

        if (input.content.length > MAX_SUMMARY_LENGTH) {
            return {
                success: false,
                error: `Google Business posts are limited to ${MAX_SUMMARY_LENGTH} characters (got ${input.content.length}).`,
            };
        }

        const body: {
            languageCode: string;
            summary: string;
            topicType: string;
            media?: Array<{ mediaFormat: string; sourceUrl: string }>;
        } = {
            languageCode: 'en',
            summary: input.content,
            topicType: 'STANDARD',
        };

        // Only attach media when a public https image URL is provided — Google
        // fetches it by URL (no upload of bytes from our side).
        if (input.imageUrl && /^https:\/\//i.test(input.imageUrl)) {
            body.media = [{ mediaFormat: 'PHOTO', sourceUrl: input.imageUrl }];
        }

        const res = await fetch(`${GBP_API_URL}/${locationName}/localPosts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
            const errMsg = data.error?.message || `HTTP ${res.status}`;
            await socialAccountRepository.recordError(input.accountId, errMsg);
            if (res.status === 401) {
                await socialAccountRepository.markConnectionStatus(
                    input.accountId,
                    'expired',
                    'Google Business token rejected',
                );
                return { success: false, error: 'Google Business token expired — reconnect the account.' };
            }
            return { success: false, error: `Google Business API Error: ${errMsg}` };
        }

        // localPosts returns the created post resource. `name` is
        // `accounts/*/locations/*/localPosts/{id}`; `searchUrl` is the public link.
        const postName: string | undefined = data.name;
        const postId = postName ? postName.split('/').pop() : undefined;
        const postUrl: string | undefined = data.searchUrl;

        await socialAccountRepository.markUsed(input.accountId);

        return { success: true, postId, postUrl };
    } catch (error) {
        console.error('Google Business publish error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish to Google Business',
        };
    }
}
