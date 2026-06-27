'use server';

/**
 * Mastodon Publishing Flow
 *
 * Auth: per-instance access token. The connect route stored the token
 * (encrypted) as the access token and the instance origin in
 * `metadata.instanceUrl`.
 *
 * Optional media: uploaded via `POST {instance}/api/v2/media`. v2 may return
 * 202 (still processing) — we then poll `GET /api/v1/media/{id}` until the
 * attachment has a `url` (bounded). The status is created via
 * `POST /api/v1/statuses` with `status` text and any `media_ids`.
 *
 * Text limit defaults to 500 chars but is instance-configurable; rather than
 * guess, we send and surface the instance's validation error verbatim if it
 * rejects an over-long status.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const MASTODON_MAX_MEDIA = 4;

interface MastodonPublishInput {
    accountId: string;
    text: string;
    mediaUrl?: string; // base64 data URL or http(s) URL (legacy single-media)
    /** Ordered media list (≤4 attached). Takes precedence over `mediaUrl`. */
    mediaUrls?: string[];
    altText?: string;
    /** Reply target — sets `in_reply_to_id` so the status chains a reply. */
    inReplyToId?: string;
    /** Optional first comment, posted as a reply after the main post (non-fatal). */
    firstComment?: string;
}

interface MastodonPublishResult {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
}

/** Resolve a base64 data URL or http(s) URL to a Blob + filename. */
async function loadMediaBlob(mediaUrl: string): Promise<{ blob: Blob; filename: string }> {
    if (mediaUrl.startsWith('data:')) {
        const matches = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error('Invalid base64 data URL format');
        }
        const mimeType = matches[1];
        const bytes = new Uint8Array(Buffer.from(matches[2], 'base64'));
        const ext = mimeType.split('/')[1] || 'bin';
        return { blob: new Blob([bytes], { type: mimeType }), filename: `upload.${ext}` };
    }
    const res = await fetch(mediaUrl);
    if (!res.ok) {
        throw new Error('Failed to download media from URL');
    }
    const arrayBuffer = await res.arrayBuffer();
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const ext = mimeType.split('/')[1] || 'bin';
    return { blob: new Blob([arrayBuffer], { type: mimeType }), filename: `upload.${ext}` };
}

/**
 * Poll an attachment until it finishes processing (gains a non-null `url`).
 * Bounded to ~60s (12 × 5s).
 */
async function waitForMediaReady(
    instanceUrl: string,
    accessToken: string,
    mediaId: string,
): Promise<boolean> {
    for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const res = await fetch(`${instanceUrl}/api/v1/media/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 206) {
            // Still processing.
            continue;
        }
        if (!res.ok) {
            continue; // transient — keep trying within budget
        }
        const data = await res.json().catch(() => ({}));
        if (data.url) {
            return true;
        }
    }
    return false;
}

/** Upload one media attachment (v2), waiting for processing if needed. */
async function uploadMedia(
    instanceUrl: string,
    accessToken: string,
    accountId: string,
    mediaUrl: string,
    altText?: string,
): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
    const { blob, filename } = await loadMediaBlob(mediaUrl);
    const form = new FormData();
    form.append('file', blob, filename);
    if (altText) {
        form.append('description', altText);
    }

    const uploadRes = await fetch(`${instanceUrl}/api/v2/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
    });

    if (!uploadRes.ok && uploadRes.status !== 202) {
        const errText = await uploadRes.text();
        await socialAccountRepository.recordError(accountId, `Mastodon media upload failed: ${errText}`);
        return { ok: false, error: `Mastodon media upload failed: ${errText}` };
    }

    const uploadData = await uploadRes.json().catch(() => ({}));
    const mediaId: string | undefined = uploadData.id?.toString();
    if (!mediaId) {
        return { ok: false, error: 'Mastodon did not return a media id.' };
    }

    // 202 → processing; wait until the attachment is usable.
    if (uploadRes.status === 202 || !uploadData.url) {
        const ready = await waitForMediaReady(instanceUrl, accessToken, mediaId);
        if (!ready) {
            return { ok: false, error: 'Mastodon media processing timed out.' };
        }
    }

    return { ok: true, mediaId };
}

/** Create one status (post / reply). Used for the main post and first comment. */
async function createStatus(
    instanceUrl: string,
    accessToken: string,
    accountId: string,
    opts: { text: string; mediaIds: string[]; inReplyToId?: string },
): Promise<MastodonPublishResult> {
    const statusBody: { status: string; media_ids?: string[]; in_reply_to_id?: string } = {
        status: opts.text,
    };
    if (opts.mediaIds.length > 0) {
        statusBody.media_ids = opts.mediaIds;
    }
    if (opts.inReplyToId) {
        statusBody.in_reply_to_id = opts.inReplyToId;
    }

    const statusRes = await fetch(`${instanceUrl}/api/v1/statuses`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusBody),
    });

    if (!statusRes.ok) {
        const errData = await statusRes.json().catch(() => ({}));
        const errMsg = errData.error || (await statusRes.text().catch(() => '')) || `HTTP ${statusRes.status}`;
        await socialAccountRepository.recordError(accountId, `Mastodon status failed: ${errMsg}`);
        if (statusRes.status === 401) {
            await socialAccountRepository.markConnectionStatus(accountId, 'expired', 'Mastodon token rejected');
            return { success: false, error: 'Mastodon token rejected — reconnect the account.' };
        }
        return { success: false, error: `Mastodon API Error: ${errMsg}` };
    }

    const statusData = await statusRes.json();
    const postId: string | undefined = statusData.id?.toString();
    const postUrl: string | undefined = statusData.url || statusData.uri;

    if (!postId) {
        return { success: false, error: 'Mastodon did not return a status id.' };
    }

    return { success: true, postId, postUrl };
}

export async function publishToMastodon(input: MastodonPublishInput): Promise<MastodonPublishResult> {
    try {
        const accountData = await socialAccountRepository.findByIdWithTokens(input.accountId);
        if (!accountData) {
            return { success: false, error: 'Mastodon account not found. Please reconnect your Mastodon account.' };
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'mastodon') {
            return { success: false, error: 'Invalid account. This is not a Mastodon account.' };
        }
        if (!accessToken) {
            return { success: false, error: 'Access token not found. Please reconnect your Mastodon account.' };
        }

        const instanceUrl = (account.metadata?.instanceUrl as string | undefined)?.replace(/\/+$/, '');
        if (!instanceUrl) {
            return { success: false, error: 'Mastodon instance URL missing — reconnect the account.' };
        }

        // Resolve the ordered media list (carousel-aware), capped at 4.
        const mediaList: string[] = (
            input.mediaUrls && input.mediaUrls.length > 0
                ? input.mediaUrls
                : input.mediaUrl
                    ? [input.mediaUrl]
                    : []
        ).slice(0, MASTODON_MAX_MEDIA);

        // ---- Step 1: optional media upload (v2) — up to 4 attachments ----
        const mediaIds: string[] = [];
        for (const url of mediaList) {
            const uploaded = await uploadMedia(instanceUrl, accessToken, input.accountId, url, input.altText);
            if (!uploaded.ok) {
                return { success: false, error: uploaded.error };
            }
            mediaIds.push(uploaded.mediaId!);
        }

        // ---- Step 2: create the status ----
        const main = await createStatus(instanceUrl, accessToken, input.accountId, {
            text: input.text,
            mediaIds,
            inReplyToId: input.inReplyToId,
        });
        if (!main.success || !main.postId) {
            return main;
        }

        // ---- Optional first comment as a reply (non-fatal) ----
        if (input.firstComment && input.firstComment.trim()) {
            try {
                await createStatus(instanceUrl, accessToken, input.accountId, {
                    text: input.firstComment,
                    mediaIds: [],
                    inReplyToId: main.postId,
                });
            } catch (commentErr) {
                console.error('Mastodon first-comment failed (non-fatal):', commentErr);
            }
        }

        await socialAccountRepository.markUsed(input.accountId);

        return { success: true, postId: main.postId, postUrl: main.postUrl };
    } catch (error) {
        console.error('Mastodon publish error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish to Mastodon',
        };
    }
}
