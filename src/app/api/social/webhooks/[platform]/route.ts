/**
 * Inbound social webhook receiver (Epic 3).
 *
 * GET  — verification handshake. Meta sends `hub.mode=subscribe` with
 *        `hub.verify_token` + `hub.challenge`; we echo the challenge when the
 *        token matches `process.env.META_WEBHOOK_VERIFY_TOKEN`.
 *
 * POST — inbound event delivery. For Meta platforms we verify the
 *        `X-Hub-Signature-256` HMAC-SHA256 over the RAW body using the app
 *        secret, then parse comment / DM / mention entries and fan them into
 *        `recordInboundInteraction`. A generic fallback accepts a normalized
 *        payload for other platforms.
 *
 * Hard rules:
 *  - This endpoint is unauthenticated (platforms call it), so it derives
 *    organizationId from the matched connected account's brand — never from the
 *    request body.
 *  - It is fully defensive: every parse path is wrapped, errors are logged, and
 *    we ALWAYS return 200 quickly so the platform doesn't retry-storm us.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import brandRepository from '@/lib/db/repository/brand.repository';
import { recordInboundInteraction } from '@/lib/social/inbox';
import type { SocialInteractionType } from '@/lib/db/models/social-interaction.model';
import type { SocialPlatform } from '@/lib/db/models/social-account.model';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — verification handshake
// ---------------------------------------------------------------------------
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    try {
        await params; // platform not needed for the Meta handshake
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('hub.mode');
        const token = searchParams.get('hub.verify_token');
        const challenge = searchParams.get('hub.challenge');

        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

        if (mode === 'subscribe' && expected && token === expected && challenge) {
            // Echo the raw challenge string with a 200.
            return new NextResponse(challenge, { status: 200 });
        }

        return new NextResponse('Forbidden', { status: 403 });
    } catch (error) {
        console.error('[social.webhook] GET handshake error:', error);
        return new NextResponse('Forbidden', { status: 403 });
    }
}

// ---------------------------------------------------------------------------
// POST — inbound events
// ---------------------------------------------------------------------------
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    // Always 200 at the end; do all real work inside try/catch.
    try {
        const { platform } = await params;
        const rawBody = await request.text();

        // Signature verification (Meta platforms). Fail-closed only when an app
        // secret is configured; if no secret is set we accept (dev / generic).
        if ((platform === 'instagram' || platform === 'facebook')) {
            const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
            if (appSecret) {
                const signature = request.headers.get('x-hub-signature-256');
                if (!verifyMetaSignature(rawBody, signature, appSecret)) {
                    console.warn('[social.webhook] Meta signature mismatch — dropping');
                    return NextResponse.json({ ok: true }, { status: 200 });
                }
            }
        }

        let payload: unknown;
        try {
            payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
            payload = {};
        }

        if (platform === 'instagram' || platform === 'facebook') {
            await handleMetaPayload(platform, payload).catch((e) =>
                console.error('[social.webhook] Meta handler error:', e)
            );
        } else {
            await handleGenericPayload(platform, payload).catch((e) =>
                console.error('[social.webhook] generic handler error:', e)
            );
        }
    } catch (error) {
        console.error('[social.webhook] POST fatal (swallowed):', error);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verifyMetaSignature(
    rawBody: string,
    signatureHeader: string | null,
    appSecret: string
): boolean {
    if (!signatureHeader) return false;
    try {
        const expected =
            'sha256=' +
            crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
        const a = Buffer.from(signatureHeader);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

/**
 * Resolve the connected account (by platform + platformAccountId), then its
 * brand → organizationId. Returns null when we can't map the event to a tenant
 * (the caller skips the event rather than guessing).
 */
async function resolveTenant(
    platform: SocialPlatform,
    platformAccountId: string
): Promise<{ accountId: string; brandId: string; } | null> {
    if (!platformAccountId) return null;
    const account = await socialAccountRepository.findByPlatformAccountId(platform, platformAccountId);
    if (!account) return null;

    const brand = await brandRepository.findById(account.brandId);
    return {
        accountId: String(account._id),
        brandId: account.brandId
    };
}

interface NormalizedEvent {
    platformAccountId: string;
    type: SocialInteractionType;
    externalId: string;
    conversationId?: string;
    parentExternalId?: string;
    authorHandle: string;
    authorDisplayName?: string;
    authorPlatformId?: string;
    text?: string;
    permalink?: string;
    occurredAt?: Date;
    raw?: Record<string, unknown>;
}

/**
 * Parse a Meta (Instagram / Facebook) webhook payload into normalized events.
 *
 * Meta shape: `{ object, entry: [{ id, time, changes: [{ field, value }],
 * messaging: [...] }] }`. We handle:
 *  - `changes[].field === 'comments'|'feed'|'mentions'` → comment / mention
 *  - `messaging[]` (page/IG DMs) → dm
 */
async function handleMetaPayload(platform: string, payload: unknown): Promise<void> {
    const body = payload as {
        entry?: Array<{
            id?: string;
            time?: number;
            changes?: Array<{ field?: string; value?: Record<string, any> }>;
            messaging?: Array<Record<string, any>>;
        }>;
    };

    if (!body?.entry?.length) return;

    const platformKey = platform as SocialPlatform;

    for (const entry of body.entry) {
        const entryAccountId = entry.id || '';

        // --- field changes (comments, mentions, feed) ---
        for (const change of entry.changes || []) {
            const event = parseMetaChange(entryAccountId, change, entry.time);
            if (event) await dispatch(platformKey, event);
        }

        // --- messaging (DMs) ---
        for (const msg of entry.messaging || []) {
            const event = parseMetaMessaging(entryAccountId, msg);
            if (event) await dispatch(platformKey, event);
        }
    }
}

function parseMetaChange(
    accountId: string,
    change: { field?: string; value?: Record<string, any> } | undefined,
    entryTime?: number
): NormalizedEvent | null {
    if (!change?.value) return null;
    const v = change.value;
    const field = change.field || '';

    // Ignore the page's own activity / non-add verbs where present.
    if (v.verb && v.verb !== 'add') return null;

    let type: SocialInteractionType = 'comment';
    if (field === 'mentions') type = 'mention';

    const externalId =
        v.comment_id || v.id || v.message_id || v.media_id || v.post_id;
    if (!externalId) return null;

    const fromId = v.from?.id;
    const fromName = v.from?.name || v.from?.username;

    return {
        platformAccountId: accountId,
        type,
        externalId: String(externalId),
        parentExternalId: v.parent_id || v.post_id || v.media_id || undefined,
        conversationId: v.post_id || v.media_id || undefined,
        authorHandle: fromName || fromId || 'unknown',
        authorDisplayName: fromName,
        authorPlatformId: fromId ? String(fromId) : undefined,
        text: v.message || v.text || undefined,
        permalink: v.permalink_url || v.link || undefined,
        occurredAt: metaTime(v.created_time, entryTime),
        raw: v,
    };
}

function parseMetaMessaging(
    accountId: string,
    msg: Record<string, any>
): NormalizedEvent | null {
    const message = msg.message;
    if (!message || message.is_echo) return null;

    const externalId = message.mid;
    if (!externalId) return null;

    const senderId = msg.sender?.id;

    return {
        platformAccountId: accountId,
        type: 'dm',
        externalId: String(externalId),
        conversationId: senderId ? String(senderId) : undefined,
        authorHandle: senderId ? String(senderId) : 'unknown',
        authorPlatformId: senderId ? String(senderId) : undefined,
        text: message.text || undefined,
        occurredAt: msg.timestamp ? new Date(Number(msg.timestamp)) : new Date(),
        raw: msg,
    };
}

function metaTime(createdTime?: number | string, entryTime?: number): Date {
    if (createdTime) {
        const n = Number(createdTime);
        // Graph created_time is seconds; entry.time is seconds too.
        if (!Number.isNaN(n)) return new Date(n * 1000);
        const d = new Date(createdTime);
        if (!Number.isNaN(d.getTime())) return d;
    }
    if (entryTime) return new Date(entryTime * 1000);
    return new Date();
}

/**
 * Generic fallback: accept a pre-normalized event body so non-Meta platforms /
 * internal pollers can post inbound interactions through the same path.
 * Expected shape: `{ platformAccountId, type, externalId, authorHandle, ... }`
 * or `{ events: [ ...same... ] }`.
 */
async function handleGenericPayload(platform: string, payload: unknown): Promise<void> {
    const body = payload as Record<string, any>;
    const events: Record<string, any>[] = Array.isArray(body?.events)
        ? body.events
        : body && (body.externalId || body.platformAccountId)
          ? [body]
          : [];

    const platformKey = platform as SocialPlatform;

    for (const e of events) {
        if (!e?.externalId || !e?.platformAccountId) continue;
        const type: SocialInteractionType = ['dm', 'comment', 'mention', 'reaction', 'follow'].includes(
            e.type
        )
            ? e.type
            : 'mention';

        await dispatch(platformKey, {
            platformAccountId: String(e.platformAccountId),
            type,
            externalId: String(e.externalId),
            conversationId: e.conversationId ? String(e.conversationId) : undefined,
            parentExternalId: e.parentExternalId ? String(e.parentExternalId) : undefined,
            authorHandle: e.authorHandle || e.authorPlatformId || 'unknown',
            authorDisplayName: e.authorDisplayName,
            authorPlatformId: e.authorPlatformId ? String(e.authorPlatformId) : undefined,
            text: e.text,
            permalink: e.permalink,
            occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
            raw: e,
        });
    }
}

/** Resolve tenant for a normalized event and persist it. */
async function dispatch(platform: SocialPlatform, event: NormalizedEvent): Promise<void> {
    try {
        const tenant = await resolveTenant(platform, event.platformAccountId);
        if (!tenant) {
            console.warn(
                `[social.webhook] no connected ${platform} account for ${event.platformAccountId} — skipping`
            );
            return;
        }

        await recordInboundInteraction({
            brandId: tenant.brandId,
            accountId: tenant.accountId,
            platform,
            type: event.type,
            externalId: event.externalId,
            conversationId: event.conversationId,
            parentExternalId: event.parentExternalId,
            authorHandle: event.authorHandle,
            authorDisplayName: event.authorDisplayName,
            authorPlatformId: event.authorPlatformId,
            text: event.text,
            permalink: event.permalink,
            occurredAt: event.occurredAt,
            raw: event.raw,
        });
    } catch (error) {
        console.error('[social.webhook] dispatch error (swallowed):', error);
    }
}
