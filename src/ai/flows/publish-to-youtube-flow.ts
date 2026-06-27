'use server';

/**
 * YouTube Publishing Flow
 *
 * Uploads a video to the connected channel via the YouTube Data API v3
 * (videos.insert, multipart upload):
 *   POST https://www.googleapis.com/upload/youtube/v3/videos
 *        ?part=snippet,status&uploadType=multipart
 *
 * Body is a multipart/related payload: a JSON part (snippet + status) followed
 * by the binary video part.
 *   - snippet:  { title, description }   (title = first line of content, ≤100 chars)
 *   - status:   { privacyStatus: 'public' }
 *
 * The video comes from a VIDEO URL stored on the post (mediaUrls[0]). We
 * download it server-side (same model as other flows that fetch our own media),
 * with a size guard to avoid buffering pathologically large files in memory.
 *
 * Tokens: YouTube stores a Google access token + refresh token. The
 * social-token-refresh cron keeps the access token fresh; here we just use the
 * stored access token and surface 401s clearly so the user knows to reconnect.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const YOUTUBE_UPLOAD_URL =
    'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart';

// Hard cap on in-memory video buffering. Anything larger should use a
// resumable upload; we reject with a clear error rather than OOM the worker.
const MAX_VIDEO_BYTES = 256 * 1024 * 1024; // 256 MB

interface YouTubePublishInput {
    accountId: string;
    /** Full post content — first line becomes the title, full text the description. */
    content: string;
    /** Public URL of the video to upload. */
    videoUrl: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    /** Explicit video title; falls back to the first line of content when omitted. */
    title?: string;
    /** Self-declared "made for kids" (COPPA) flag → status.selfDeclaredMadeForKids. */
    madeForKids?: boolean;
    /** Video keyword tags → snippet.tags. */
    tags?: string[];
    /** Whether to notify subscribers of the upload → ?notifySubscribers=. */
    notifySubscribers?: boolean;
}

interface YouTubePublishResult {
    success: boolean;
    videoId?: string;
    videoUrl?: string;
    error?: string;
}

/**
 * Upload a video to YouTube.
 */
export async function publishToYouTube(input: YouTubePublishInput): Promise<YouTubePublishResult> {
    try {
        const accountData = await socialAccountRepository.findByIdWithTokens(input.accountId);
        if (!accountData) {
            return { success: false, error: 'YouTube account not found. Please reconnect your YouTube account.' };
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'youtube') {
            return { success: false, error: 'Invalid account. This is not a YouTube account.' };
        }

        if (!accessToken) {
            return { success: false, error: 'Access token not found. Please reconnect your YouTube account.' };
        }

        if (!input.videoUrl) {
            return { success: false, error: 'YouTube requires a video to upload.' };
        }

        // ---- Download the video server-side (with a size guard) ----
        const mediaResponse = await fetch(input.videoUrl);
        if (!mediaResponse.ok) {
            return { success: false, error: `Failed to download video (${mediaResponse.status}).` };
        }

        const contentLength = Number(mediaResponse.headers.get('content-length') || '0');
        if (contentLength && contentLength > MAX_VIDEO_BYTES) {
            return {
                success: false,
                error: `Video is too large (${Math.round(contentLength / 1024 / 1024)} MB). Maximum supported is ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`,
            };
        }

        const videoArrayBuffer = await mediaResponse.arrayBuffer();
        const videoBuffer = Buffer.from(videoArrayBuffer);

        if (videoBuffer.length > MAX_VIDEO_BYTES) {
            return {
                success: false,
                error: `Video is too large (${Math.round(videoBuffer.length / 1024 / 1024)} MB). Maximum supported is ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`,
            };
        }

        const videoContentType = mediaResponse.headers.get('content-type') || 'video/*';

        // ---- Build snippet/status metadata ----
        const title = (input.title || input.content.split('\n')[0] || 'Untitled').slice(0, 100);
        const description = input.content;
        const privacyStatus = input.privacyStatus || 'public';

        const snippet: { title: string; description: string; tags?: string[] } = {
            title,
            description,
        };
        if (input.tags && input.tags.length > 0) {
            snippet.tags = input.tags;
        }

        const status: { privacyStatus: string; selfDeclaredMadeForKids?: boolean } = {
            privacyStatus,
        };
        if (typeof input.madeForKids === 'boolean') {
            status.selfDeclaredMadeForKids = input.madeForKids;
        }

        const metadata = { snippet, status };

        // ---- Assemble the multipart/related body ----
        const boundary = `montrai-yt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const newline = '\r\n';

        const preamble = Buffer.from(
            `--${boundary}${newline}` +
            `Content-Type: application/json; charset=UTF-8${newline}${newline}` +
            `${JSON.stringify(metadata)}${newline}` +
            `--${boundary}${newline}` +
            `Content-Type: ${videoContentType}${newline}${newline}`,
            'utf-8',
        );
        const epilogue = Buffer.from(`${newline}--${boundary}--${newline}`, 'utf-8');

        const body = Buffer.concat([preamble, videoBuffer, epilogue]);

        // ---- Upload ----
        // notifySubscribers controls whether YouTube notifies channel subscribers.
        const uploadUrl =
            typeof input.notifySubscribers === 'boolean'
                ? `${YOUTUBE_UPLOAD_URL}&notifySubscribers=${input.notifySubscribers}`
                : YOUTUBE_UPLOAD_URL;

        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
                'Content-Length': String(body.length),
            },
            body,
        });

        const uploadData = await uploadResponse.json().catch(() => ({}));

        if (!uploadResponse.ok || uploadData.error) {
            const errMsg =
                uploadData.error?.message ||
                uploadData.error?.errors?.[0]?.message ||
                'Failed to upload video';
            await socialAccountRepository.recordError(input.accountId, `${uploadResponse.status}: ${errMsg}`);
            if (uploadResponse.status === 401) {
                return { success: false, error: 'YouTube token expired or invalid — reconnect the account.' };
            }
            if (uploadResponse.status === 403) {
                return { success: false, error: `YouTube API Error: ${errMsg} (check upload quota/permissions).` };
            }
            return { success: false, error: `YouTube API Error: ${errMsg}` };
        }

        const videoId: string | undefined = uploadData.id;
        if (!videoId) {
            return { success: false, error: 'YouTube did not return a video id.' };
        }

        await socialAccountRepository.markUsed(input.accountId);

        return {
            success: true,
            videoId,
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
    } catch (error) {
        console.error('YouTube publish error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish to YouTube',
        };
    }
}
