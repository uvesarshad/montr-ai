'use server';

/**
 * TikTok Publishing Flow
 * 
 * TikTok uses a two-step video upload process:
 * 1. Initialize upload to get upload URL
 * 2. Upload video to that URL
 * 3. Publish the video with caption
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const TIKTOK_VIDEO_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_PUBLISH_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

interface TikTokPublishInput {
    accountId: string;
    caption: string;
    videoUrl: string;
    privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
    disableDuet?: boolean;
    disableStitch?: boolean;
    disableComment?: boolean;
    /** Discloses the post as a paid partnership / branded content. */
    brandContentToggle?: boolean;
    /** Discloses the post as promoting the creator's own brand/business. */
    brandOrganicToggle?: boolean;
    /** Flags the video as AI-generated content (AIGC). */
    isAigc?: boolean;
}

interface TikTokPublishResult {
    success: boolean;
    postId?: string;
    error?: string;
}

/**
 * Publish a video to TikTok
 */
export async function publishToTikTok(input: TikTokPublishInput): Promise<TikTokPublishResult> {
    try {
        // Get account with decrypted tokens
        const accountData = await socialAccountRepository.findByIdWithTokens(input.accountId);
        if (!accountData) {
            return { success: false, error: 'TikTok account not found' };
        }

        const accessToken = accountData.accessToken;
        if (!accessToken) {
            return { success: false, error: 'Invalid access token' };
        }

        // Initialize video upload
        const postInfo: Record<string, unknown> = {
            title: input.caption.slice(0, 150), // TikTok title limit
            privacy_level: input.privacyLevel || 'PUBLIC_TO_EVERYONE',
            disable_duet: input.disableDuet || false,
            disable_stitch: input.disableStitch || false,
            disable_comment: input.disableComment || false,
        };

        // Branded content / commercial disclosure (Content Posting API).
        // brand_content_toggle => paid partnership; brand_organic_toggle => own brand.
        if (input.brandContentToggle) {
            postInfo.brand_content_toggle = true;
        }
        if (input.brandOrganicToggle) {
            postInfo.brand_organic_toggle = true;
        }
        if (input.isAigc) {
            postInfo.is_aigc = true;
        }

        const initPayload = {
            post_info: postInfo,
            source_info: {
                source: 'PULL_FROM_URL',
                video_url: input.videoUrl,
            },
        };

        const initResponse = await fetch(TIKTOK_VIDEO_INIT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify(initPayload),
        });

        if (!initResponse.ok) {
            const errorData = await initResponse.json();
            console.error('TikTok video init error:', errorData);
            return {
                success: false,
                error: errorData.error?.message || 'Failed to initialize video upload'
            };
        }

        const initData = await initResponse.json();

        if (initData.error?.code !== 'ok') {
            return {
                success: false,
                error: initData.error?.message || 'Video initialization failed'
            };
        }

        const publishId = initData.data?.publish_id;
        if (!publishId) {
            return { success: false, error: 'No publish ID returned' };
        }

        // Poll for publish status
        let attempts = 0;
        const maxAttempts = 30; // 5 minutes max (10 second intervals)

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

            const statusResponse = await fetch(TIKTOK_PUBLISH_STATUS_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                },
                body: JSON.stringify({ publish_id: publishId }),
            });

            if (!statusResponse.ok) {
                attempts++;
                continue;
            }

            const statusData = await statusResponse.json();
            const status = statusData.data?.status;

            if (status === 'PUBLISH_COMPLETE') {
                return {
                    success: true,
                    postId: statusData.data?.publicaly_available_post_id?.[0],
                };
            } else if (status === 'FAILED') {
                return {
                    success: false,
                    error: statusData.data?.fail_reason || 'Publishing failed',
                };
            }

            attempts++;
        }

        return { success: false, error: 'Publishing timed out' };
    } catch (error) {
        console.error('TikTok publish error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish to TikTok'
        };
    }
}

/**
 * Refresh TikTok access token
 */
export async function refreshTikTokToken(accountId: string): Promise<boolean> {
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

        const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_key: process.env.TIKTOK_CLIENT_KEY!,
                client_secret: process.env.TIKTOK_CLIENT_SECRET!,
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
        console.error('TikTok token refresh error:', error);
        return false;
    }
}
