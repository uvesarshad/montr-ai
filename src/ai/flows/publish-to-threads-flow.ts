'use server';

/**
 * Threads Publishing Flow
 *
 * Threads Graph API (graph.threads.net/v1.0) — two-step publish:
 *   1. Create a media container:  POST /{threads-user-id}/threads
 *        media_type=TEXT | IMAGE | VIDEO  + text  + image_url / video_url
 *      For VIDEO, the container needs to finish processing before publishing,
 *      so we poll the container's status until FINISHED (bounded retry).
 *   2. Publish the container:      POST /{threads-user-id}/threads_publish
 *        creation_id={container-id}
 *
 * Tokens: Threads stores a long-lived (60-day) access token and NO refresh
 * token. On a 401/expired token we surface a clear "reconnect" error rather
 * than retrying.
 *
 * Media is pulled by Threads from the public URLs stored on our own posts
 * (image_url / video_url) — same model as the Instagram flow — so we do not
 * download the media ourselves.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const THREADS_API_URL = 'https://graph.threads.net/v1.0';

interface ThreadsPublishInput {
    accountId: string;
    text: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    /**
     * Ordered media list for a carousel post. When more than one item is
     * present Threads publishes a CAROUSEL container with child containers.
     * Takes precedence over `mediaUrl` when length > 1.
     */
    mediaUrls?: string[];
    mediaTypes?: ('image' | 'video')[];
    /**
     * Reply-to target. When set, the created container carries `reply_to_id`,
     * making the new post a reply in a thread chain.
     */
    replyToId?: string;
    /** Optional first comment, posted as a reply after the main post (non-fatal). */
    firstComment?: string;
}

interface ThreadsPublishResult {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
}

/** Treat any Graph error that smells like an auth failure as "reconnect". */
function isAuthError(status: number, error: { code?: number; type?: string } | undefined): boolean {
    if (status === 401) return true;
    // Meta Graph OAuth error code is 190 (expired/invalid token).
    if (error?.code === 190) return true;
    if (error?.type === 'OAuthException') return true;
    return false;
}

/**
 * Publish a post (text-only, single image, or single video) to Threads.
 */
export async function publishToThreads(input: ThreadsPublishInput): Promise<ThreadsPublishResult> {
    try {
        const accountData = await socialAccountRepository.findByIdWithTokens(input.accountId);
        if (!accountData) {
            return { success: false, error: 'Threads account not found. Please reconnect your Threads account.' };
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'threads') {
            return { success: false, error: 'Invalid account. This is not a Threads account.' };
        }

        if (!accessToken) {
            return { success: false, error: 'Access token not found. Please reconnect your Threads account.' };
        }

        const threadsUserId = account.platformAccountId;

        // Resolve the ordered media list (carousel-aware) — falls back to the
        // single-media legacy fields.
        const mediaList: string[] = input.mediaUrls && input.mediaUrls.length > 0
            ? input.mediaUrls
            : input.mediaUrl
                ? [input.mediaUrl]
                : [];
        const mediaTypeList: ('image' | 'video')[] = input.mediaTypes && input.mediaTypes.length > 0
            ? input.mediaTypes
            : input.mediaType
                ? [input.mediaType]
                : [];

        // ---- Publish the main post (text / single media / carousel) ----
        const main = await createAndPublish(
            threadsUserId,
            accessToken,
            input.accountId,
            input.text,
            mediaList,
            mediaTypeList,
            input.replyToId,
        );
        if (!main.success || !main.postId) {
            return main;
        }

        const postId = main.postId;

        // ---- Optional first comment as a reply (non-fatal) ----
        if (input.firstComment && input.firstComment.trim()) {
            try {
                await createAndPublish(
                    threadsUserId,
                    accessToken,
                    input.accountId,
                    input.firstComment,
                    [],
                    [],
                    postId,
                );
            } catch (commentErr) {
                console.error('Threads first-comment failed (non-fatal):', commentErr);
            }
        }

        await socialAccountRepository.markUsed(input.accountId);

        // Threads_publish returns the media id, not a shortcode. We can build a
        // best-effort permalink from the username when available; otherwise omit.
        const username = account.platformUsername;
        const postUrl = username
            ? `https://www.threads.net/@${username}/post/${postId}`
            : undefined;

        return { success: true, postId, postUrl };
    } catch (error) {
        console.error('Threads publish error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish to Threads',
        };
    }
}

/**
 * Create a single (text / image / video / carousel) container and publish it.
 * Used for the main post, each thread segment, and the first comment. When
 * `replyToId` is set the container carries `reply_to_id` to chain a reply.
 */
async function createAndPublish(
    threadsUserId: string,
    accessToken: string,
    accountId: string,
    text: string,
    mediaUrls: string[],
    mediaTypes: ('image' | 'video')[],
    replyToId?: string,
): Promise<ThreadsPublishResult> {
    const isCarousel = mediaUrls.length > 1;

    // ---- Step 1: create the (top-level) media container ----
    const containerParams = new URLSearchParams();
    containerParams.set('access_token', accessToken);
    containerParams.set('text', text);
    if (replyToId) {
        containerParams.set('reply_to_id', replyToId);
    }

    if (isCarousel) {
        // Build a child container per media item, then a CAROUSEL parent.
        const childIds: string[] = [];
        for (let i = 0; i < mediaUrls.length; i++) {
            const childRes = await createContainer(threadsUserId, accessToken, {
                isCarouselItem: true,
                mediaUrl: mediaUrls[i],
                mediaType: mediaTypes[i] || 'image',
            });
            if (!childRes.ok || !childRes.id) {
                return { success: false, error: childRes.error || 'Threads carousel item failed.' };
            }
            childIds.push(childRes.id);
        }
        containerParams.set('media_type', 'CAROUSEL');
        containerParams.set('children', childIds.join(','));
    } else if (mediaUrls.length === 1) {
        if (mediaTypes[0] === 'video') {
            containerParams.set('media_type', 'VIDEO');
            containerParams.set('video_url', mediaUrls[0]);
        } else {
            containerParams.set('media_type', 'IMAGE');
            containerParams.set('image_url', mediaUrls[0]);
        }
    } else {
        containerParams.set('media_type', 'TEXT');
    }

    const createResponse = await fetch(`${THREADS_API_URL}/${threadsUserId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: containerParams,
    });

    const createData = await createResponse.json().catch(() => ({}));

    if (!createResponse.ok || createData.error) {
        const errMsg = createData.error?.message || 'Failed to create Threads media container';
        await socialAccountRepository.recordError(accountId, errMsg);
        if (isAuthError(createResponse.status, createData.error)) {
            return { success: false, error: 'Threads token expired — reconnect the account.' };
        }
        return { success: false, error: `Threads API Error: ${errMsg}` };
    }

    const containerId: string | undefined = createData.id;
    if (!containerId) {
        return { success: false, error: 'Threads did not return a media container id.' };
    }

    // ---- Step 1b: wait for video/carousel container processing (bounded) ----
    const needsProcessing = isCarousel || mediaTypes[0] === 'video';
    if (needsProcessing) {
        const ready = await waitForContainerReady(containerId, accessToken);
        if (!ready.ok) {
            await socialAccountRepository.recordError(accountId, ready.error || 'Threads media processing failed');
            return { success: false, error: ready.error || 'Threads media processing failed' };
        }
    }

    // ---- Step 2: publish the container ----
    const publishParams = new URLSearchParams();
    publishParams.set('access_token', accessToken);
    publishParams.set('creation_id', containerId);

    const publishResponse = await fetch(`${THREADS_API_URL}/${threadsUserId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: publishParams,
    });

    const publishData = await publishResponse.json().catch(() => ({}));

    if (!publishResponse.ok || publishData.error) {
        const errMsg = publishData.error?.message || 'Failed to publish to Threads';
        await socialAccountRepository.recordError(accountId, errMsg);
        if (isAuthError(publishResponse.status, publishData.error)) {
            return { success: false, error: 'Threads token expired — reconnect the account.' };
        }
        return { success: false, error: `Threads API Error: ${errMsg}` };
    }

    const postId: string | undefined = publishData.id;
    if (!postId) {
        return { success: false, error: 'Threads did not return a post id.' };
    }

    return { success: true, postId };
}

/** Create a single carousel child container; returns the container id. */
async function createContainer(
    threadsUserId: string,
    accessToken: string,
    opts: { isCarouselItem: boolean; mediaUrl: string; mediaType: 'image' | 'video' },
): Promise<{ ok: boolean; id?: string; error?: string }> {
    const params = new URLSearchParams();
    params.set('access_token', accessToken);
    if (opts.isCarouselItem) {
        params.set('is_carousel_item', 'true');
    }
    if (opts.mediaType === 'video') {
        params.set('media_type', 'VIDEO');
        params.set('video_url', opts.mediaUrl);
    } else {
        params.set('media_type', 'IMAGE');
        params.set('image_url', opts.mediaUrl);
    }

    const res = await fetch(`${THREADS_API_URL}/${threadsUserId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || !data.id) {
        return { ok: false, error: data.error?.message || 'Failed to create carousel item container' };
    }
    return { ok: true, id: data.id };
}

/**
 * Poll a video container until it finishes processing.
 * status field on a Threads container is one of:
 *   IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED
 * Bounded to ~2.5 minutes (15 attempts × 10s).
 */
async function waitForContainerReady(
    containerId: string,
    accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
    const maxAttempts = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10s between polls

        const statusUrl = new URL(`${THREADS_API_URL}/${containerId}`);
        statusUrl.searchParams.set('fields', 'status,error_message');
        statusUrl.searchParams.set('access_token', accessToken);

        const statusResponse = await fetch(statusUrl.toString());
        const statusData = await statusResponse.json().catch(() => ({}));

        if (!statusResponse.ok || statusData.error) {
            // Transient — keep trying within the budget.
            continue;
        }

        const status: string | undefined = statusData.status;
        if (status === 'FINISHED') {
            return { ok: true };
        }
        if (status === 'ERROR' || status === 'EXPIRED') {
            return { ok: false, error: statusData.error_message || `Threads container ${status}` };
        }
        // IN_PROGRESS — keep polling.
    }

    return { ok: false, error: 'Threads video processing timed out.' };
}
