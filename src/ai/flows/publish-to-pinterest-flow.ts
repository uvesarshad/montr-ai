'use server';

/**
 * Pinterest Publishing Flow
 * 
 * Creates pins on Pinterest boards with images, titles, and descriptions.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PINTEREST_API_URL = 'https://api.pinterest.com/v5';

interface PinterestPublishInput {
    accountId: string;
    title: string;
    description: string;
    imageUrl: string;
    link?: string;
    boardId: string;
    altText?: string;
    /** Hex color (e.g. "#6E7C7C") used as the pin's dominant color. */
    dominantColor?: string;
}

interface PinterestPublishResult {
    success: boolean;
    pinId?: string;
    pinUrl?: string;
    error?: string;
}

interface PinterestBoard {
    id: string;
    name: string;
    description?: string;
    privacy: 'PUBLIC' | 'PROTECTED' | 'SECRET';
}

/**
 * Get user's Pinterest boards
 */
export async function getPinterestBoards(accountId: string): Promise<PinterestBoard[]> {
    try {
        const accountData = await socialAccountRepository.findByIdWithTokens(accountId);
        if (!accountData) {
            return [];
        }

        const accessToken = accountData.accessToken;
        if (!accessToken) {
            return [];
        }

        const response = await fetch(`${PINTEREST_API_URL}/boards`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            console.error('Pinterest boards fetch error:', await response.text());
            return [];
        }

        const data = await response.json();
        return data.items || [];
    } catch (error) {
        console.error('Pinterest boards error:', error);
        return [];
    }
}

/**
 * Create a pin on Pinterest
 */
export async function publishToPinterest(input: PinterestPublishInput): Promise<PinterestPublishResult> {
    try {
        // Get account with decrypted tokens
        const accountData = await socialAccountRepository.findByIdWithTokens(input.accountId);
        if (!accountData) {
            return { success: false, error: 'Pinterest account not found' };
        }

        const accessToken = accountData.accessToken;
        if (!accessToken) {
            return { success: false, error: 'Invalid access token' };
        }

        // Create pin payload
        const pinPayload: {
            board_id: string;
            title: string;
            description: string;
            media_source: { source_type: string; url: string };
            link?: string;
            alt_text?: string;
            dominant_color?: string;
        } = {
            board_id: input.boardId,
            title: input.title.slice(0, 100), // Pinterest title limit
            description: input.description.slice(0, 500), // Pinterest description limit
            media_source: {
                source_type: 'image_url',
                url: input.imageUrl,
            },
        };

        if (input.link) {
            pinPayload.link = input.link;
        }

        if (input.altText) {
            pinPayload.alt_text = input.altText.slice(0, 500);
        }

        if (input.dominantColor) {
            pinPayload.dominant_color = input.dominantColor;
        }

        // Create pin
        const response = await fetch(`${PINTEREST_API_URL}/pins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pinPayload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Pinterest pin creation error:', errorData);
            return {
                success: false,
                error: errorData.message || 'Failed to create pin'
            };
        }

        const pinData = await response.json();

        return {
            success: true,
            pinId: pinData.id,
            pinUrl: `https://www.pinterest.com/pin/${pinData.id}/`,
        };
    } catch (error) {
        console.error('Pinterest publish error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish to Pinterest'
        };
    }
}

/**
 * Refresh Pinterest access token
 */
export async function refreshPinterestToken(accountId: string): Promise<boolean> {
    try {
        const account = await socialAccountRepository.findById(accountId);
        // @ts-expect-error - refreshTokenEncrypted not in public interface
        if (!account || !account.refreshTokenEncrypted) {
            return false;
        }

        // @ts-expect-error - decryptToken not in public interface
        const refreshToken = socialAccountRepository.decryptToken(account.refreshTokenEncrypted);
        if (!refreshToken) {
            return false;
        }

        const basicAuth = Buffer.from(
            `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
        ).toString('base64');

        const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();

        // @ts-expect-error - updateTokens not in public interface
        await socialAccountRepository.updateTokens(accountId, {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + data.expires_in * 1000),
        });

        return true;
    } catch (error) {
        console.error('Pinterest token refresh error:', error);
        return false;
    }
}
