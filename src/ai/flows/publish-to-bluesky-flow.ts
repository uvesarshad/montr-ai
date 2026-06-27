'use server';

/**
 * Bluesky (AT Protocol) Publishing Flow
 *
 * Auth: app-password. The connect route stored the user's app password
 * (encrypted) as the access token and the PDS host in `metadata.service`.
 * AT Proto sessions are short-lived and cheap, so we mint a fresh session per
 * publish via `com.atproto.server.createSession`, then create the post record
 * with `com.atproto.repo.createRecord` (collection `app.bsky.feed.post`).
 *
 * Optional image: uploaded via `com.atproto.repo.uploadBlob`, then embedded
 * with `app.bsky.embed.images`. Bluesky enforces a 300-grapheme text limit —
 * we reject (clear error) rather than truncate.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const DEFAULT_BLUESKY_SERVICE = 'https://bsky.social';
const MAX_GRAPHEMES = 300;
const BLUESKY_MAX_IMAGES = 4;

/** A strong ref to an AT-proto record (used for reply root/parent). */
interface BlueskyRef {
    uri: string;
    cid: string;
}

/** Reply target. `parent` is the post being replied to; `root` is the thread root. */
interface BlueskyReply {
    root: BlueskyRef;
    parent: BlueskyRef;
}

interface BlueskyPublishInput {
    accountId: string;
    text: string;
    mediaUrl?: string; // base64 data URL or http(s) URL of an image (legacy single)
    /** Ordered image list (≤4). Takes precedence over `mediaUrl`. */
    mediaUrls?: string[];
    altText?: string;
    /**
     * Reply context — full root/parent refs per the AT protocol. When only a
     * single target is known, pass it as both root and parent.
     */
    replyTo?: BlueskyReply;
    /** Optional first comment, posted as a reply after the main post (non-fatal). */
    firstComment?: string;
}

interface BlueskyPublishResult {
    success: boolean;
    postId?: string; // at:// uri
    cid?: string;    // record CID (needed to build reply refs)
    postUrl?: string;
    error?: string;
}

/** Count Unicode grapheme clusters (what Bluesky's limit actually measures). */
function graphemeLength(text: string): number {
    try {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        let count = 0;
        for (const _ of seg.segment(text)) count++;
        return count;
    } catch {
        // Fallback: code points (over-counts some emoji, never under-counts).
        return Array.from(text).length;
    }
}

/** Resolve a base64 data URL or http(s) URL to a Blob + mime type. */
async function loadImageBlob(mediaUrl: string): Promise<{ blob: Blob; mimeType: string }> {
    if (mediaUrl.startsWith('data:')) {
        const matches = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error('Invalid base64 data URL format');
        }
        const mimeType = matches[1];
        const buf = Buffer.from(matches[2], 'base64');
        // Copy into a standalone ArrayBuffer so the Blob part is ArrayBuffer-typed.
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        return { blob: new Blob([ab], { type: mimeType }), mimeType };
    }
    const res = await fetch(mediaUrl);
    if (!res.ok) {
        throw new Error('Failed to download image from URL');
    }
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    return { blob: new Blob([arrayBuffer], { type: mimeType }), mimeType };
}

/** Upload one image to the PDS as a blob; returns the AT-proto blob ref. */
async function uploadBlob(
    service: string,
    jwt: string,
    accountId: string,
    mediaUrl: string,
): Promise<{ ok: true; blob: unknown } | { ok: false; error: string }> {
    try {
        const { blob, mimeType } = await loadImageBlob(mediaUrl);
        const res = await fetch(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
            method: 'POST',
            headers: {
                'Content-Type': mimeType,
                Authorization: `Bearer ${jwt}`,
            },
            body: blob,
        });
        if (!res.ok) {
            const errText = await res.text();
            await socialAccountRepository.recordError(accountId, `Bluesky uploadBlob failed: ${errText}`);
            return { ok: false, error: `Bluesky image upload failed: ${errText}` };
        }
        const data = await res.json();
        return { ok: true, blob: data.blob };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Bluesky image upload failed' };
    }
}

/** Create an `app.bsky.feed.post` record (main post or a reply). */
async function createRecord(
    service: string,
    jwt: string,
    did: string,
    accountId: string,
    opts: { text: string; embed?: Record<string, unknown>; replyTo?: BlueskyReply },
): Promise<BlueskyPublishResult> {
    const record: Record<string, unknown> = {
        $type: 'app.bsky.feed.post',
        text: opts.text,
        createdAt: new Date().toISOString(),
    };
    if (opts.embed) record.embed = opts.embed;
    if (opts.replyTo) record.reply = opts.replyTo;

    const res = await fetch(`${service}/xrpc/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
            repo: did,
            collection: 'app.bsky.feed.post',
            record,
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        await socialAccountRepository.recordError(accountId, `Bluesky createRecord failed: ${errText}`);
        return { success: false, error: `Bluesky post failed: ${errText}` };
    }

    const data = await res.json();
    return { success: true, postId: data.uri, cid: data.cid };
}

export async function publishToBluesky(input: BlueskyPublishInput): Promise<BlueskyPublishResult> {
    try {
        const accountData = await socialAccountRepository.findByIdWithTokens(input.accountId);
        if (!accountData) {
            return { success: false, error: 'Bluesky account not found. Please reconnect your Bluesky account.' };
        }

        const { account, accessToken: appPassword } = accountData;

        if (account.platform !== 'bluesky') {
            return { success: false, error: 'Invalid account. This is not a Bluesky account.' };
        }
        if (!appPassword) {
            return { success: false, error: 'App password not found. Please reconnect your Bluesky account.' };
        }

        const graphemes = graphemeLength(input.text);
        if (graphemes > MAX_GRAPHEMES) {
            return { success: false, error: `Post is too long for Bluesky (${graphemes}/${MAX_GRAPHEMES} characters).` };
        }

        const service = (
            (account.metadata?.service as string | undefined) || DEFAULT_BLUESKY_SERVICE
        ).replace(/\/+$/, '');
        const handle = account.platformUsername;

        // ---- Step 1: create a fresh session ----
        const sessionRes = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: handle, password: appPassword }),
        });

        if (!sessionRes.ok) {
            const errText = await sessionRes.text();
            await socialAccountRepository.recordError(input.accountId, `Bluesky auth failed: ${errText}`);
            if (sessionRes.status === 401) {
                await socialAccountRepository.markConnectionStatus(input.accountId, 'expired', 'Bluesky app password rejected');
                return { success: false, error: 'Bluesky app password rejected — reconnect the account.' };
            }
            return { success: false, error: `Bluesky session error: ${errText}` };
        }

        const sessionData = await sessionRes.json();
        const jwt: string = sessionData.accessJwt;
        const did: string = sessionData.did;

        // Resolve the ordered image list (≤4).
        const imageList: string[] = (
            input.mediaUrls && input.mediaUrls.length > 0
                ? input.mediaUrls
                : input.mediaUrl
                    ? [input.mediaUrl]
                    : []
        ).slice(0, BLUESKY_MAX_IMAGES);

        // ---- Step 2: optional image uploads (up to 4) ----
        let embed: Record<string, unknown> | undefined;
        if (imageList.length > 0) {
            const images: Array<{ alt: string; image: unknown }> = [];
            for (const url of imageList) {
                const blobRef = await uploadBlob(service, jwt, input.accountId, url);
                if (!blobRef.ok) {
                    return { success: false, error: blobRef.error };
                }
                images.push({ alt: input.altText || '', image: blobRef.blob });
            }
            embed = { $type: 'app.bsky.embed.images', images };
        }

        // ---- Step 3: create the main post record ----
        const main = await createRecord(service, jwt, did, input.accountId, {
            text: input.text,
            embed,
            replyTo: input.replyTo,
        });
        if (!main.success || !main.postId) {
            return main;
        }

        // ---- Optional first comment as a reply (non-fatal) ----
        if (input.firstComment && input.firstComment.trim()) {
            try {
                const root: BlueskyRef = input.replyTo
                    ? input.replyTo.root
                    : { uri: main.postId, cid: main.cid! };
                await createRecord(service, jwt, did, input.accountId, {
                    text: input.firstComment,
                    replyTo: { root, parent: { uri: main.postId, cid: main.cid! } },
                });
            } catch (commentErr) {
                console.error('Bluesky first-comment failed (non-fatal):', commentErr);
            }
        }

        await socialAccountRepository.markUsed(input.accountId);

        const rkey = main.postId.split('/').pop();
        const postUrl = rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : undefined;

        return { success: true, postId: main.postId, cid: main.cid, postUrl };
    } catch (error) {
        console.error('Bluesky publish error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish to Bluesky',
        };
    }
}
