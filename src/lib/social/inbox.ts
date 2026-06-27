/**
 * Social inbox helpers (Epic 3 — inbound listening + reply).
 *
 * Two responsibilities:
 *
 *  1. `recordInboundInteraction(params)` — the single entry point every inbound
 *     listener (webhooks, pollers) calls. It upserts a `SocialInteraction`
 *     (deduped by accountId + externalId via the repo) and, best-effort, runs the
 *     existing `recordSocialInteraction` CRM bridge so the sender resolves to a
 *     CRM contact and lands on the unified timeline. CRM resolution failures
 *     never block the inbox write.
 *
 *  2. `replyToInteraction(interactionId, text, userId)` — looks up the stored
 *     interaction + its connected account and posts a reply through the platform
 *     API (Instagram / Facebook comment reply, X reply), then marks the
 *     interaction replied. Platforms without a reply path return a clear error.
 *
 * Multi-tenancy: this module operates on already-scoped ids. Callers in the API
 * layer must confirm brand/org access BEFORE invoking `replyToInteraction`.
 */

import { socialInteractionRepository } from '@/lib/db/repository/social-interaction.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import type {
    ISocialInteraction,
    SocialInteractionType,
} from '@/lib/db/models/social-interaction.model';
import {
    recordSocialInteraction,
    type SocialPlatform as CrmSocialPlatform,
    type SocialEventType as CrmSocialEventType,
} from '@/lib/social/crm-bridge';

export interface RecordInboundInteractionParams {
    brandId: string;
    accountId: string;
    platform: string;
    type: SocialInteractionType;
    externalId: string;
    conversationId?: string;
    parentExternalId?: string;
    authorHandle: string;
    authorDisplayName?: string;
    authorAvatarUrl?: string;
    authorPlatformId?: string;
    text?: string;
    mediaUrls?: string[];
    permalink?: string;
    occurredAt?: Date;
    raw?: Record<string, unknown>;
}

export interface RecordInboundInteractionResult {
    interaction: ISocialInteraction;
    contactId?: string;
}

// Map the inbox interaction type onto the CRM bridge's event vocabulary.
const CRM_EVENT_TYPE: Record<SocialInteractionType, CrmSocialEventType> = {
    dm: 'dm',
    comment: 'comment',
    mention: 'mention',
    reaction: 'like',
    follow: 'follower',
};

// The CRM bridge only knows a subset of platforms; map / narrow defensively.
const CRM_PLATFORMS: ReadonlySet<string> = new Set([
    'instagram',
    'linkedin',
    'x',
    'facebook',
    'tiktok',
    'youtube',
    'pinterest',
]);

/**
 * Upsert an inbound interaction and (best-effort) resolve a CRM contact.
 *
 * The CRM bridge runs after the inbox write so the inbox is never blocked by
 * identity-resolution gaps. If the bridge resolves a contactId we patch it back
 * onto the interaction so the inbox row links to the contact.
 */
export async function recordInboundInteraction(
    params: RecordInboundInteractionParams
): Promise<RecordInboundInteractionResult> {
    const occurredAt = params.occurredAt ?? new Date();

    const interaction = await socialInteractionRepository.create({
        brandId: params.brandId,
        accountId: params.accountId,
        platform: params.platform,
        type: params.type,
        externalId: params.externalId,
        conversationId: params.conversationId,
        parentExternalId: params.parentExternalId,
        authorHandle: params.authorHandle,
        authorDisplayName: params.authorDisplayName,
        authorAvatarUrl: params.authorAvatarUrl,
        authorPlatformId: params.authorPlatformId,
        text: params.text,
        mediaUrls: params.mediaUrls,
        permalink: params.permalink,
        occurredAt,
        raw: params.raw,
    });

    let contactId: string | undefined;

    // Best-effort CRM bridge. Never throw out of here.
    try {
        if (CRM_PLATFORMS.has(params.platform)) {
            const bridgeResult = await recordSocialInteraction({
                brandId: params.brandId,
                timestamp: occurredAt,
                platform: params.platform as CrmSocialPlatform,
                eventType: CRM_EVENT_TYPE[params.type],
                externalId: params.externalId,
                senderHandle: params.authorHandle,
                senderName: params.authorDisplayName,
                body: params.text,
                url: params.permalink,
                metadata: { accountId: params.accountId, interactionId: String(interaction._id) },
            });
            contactId = bridgeResult.contactId;
        }
    } catch (error) {
        console.error('[social.inbox] CRM bridge failed (non-fatal):', error);
    }

    // Link the resolved contact back onto the interaction if we got one and it
    // isn't already set.
    if (contactId && !interaction.contactId) {
        try {
            interaction.contactId = contactId;
            await interaction.save();
        } catch (error) {
            console.error('[social.inbox] failed to attach contactId (non-fatal):', error);
        }
    }

    return { interaction, contactId };
}

export class ReplyNotSupportedError extends Error {
    constructor(platform: string) {
        super(`Reply not supported for ${platform}`);
        this.name = 'ReplyNotSupportedError';
    }
}

export interface ReplyResult {
    interaction: ISocialInteraction;
    externalReplyId?: string;
}

/**
 * Post a reply to a stored interaction via the platform API, then mark it
 * replied. Implements Instagram + Facebook (comment reply) and X (reply tweet);
 * other platforms throw `ReplyNotSupportedError`.
 *
 * Access control is the caller's responsibility — this looks up by id only.
 */
export async function replyToInteraction(
    interactionId: string,
    text: string,
    userId: string
): Promise<ReplyResult> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
        throw new Error('Reply text is required');
    }

    const interaction = await socialInteractionRepository.findById(interactionId);
    if (!interaction) {
        throw new Error('Interaction not found');
    }

    const accountData = await socialAccountRepository.findByIdWithTokens(interaction.accountId);
    if (!accountData) {
        throw new Error('Connected account not found. Please reconnect the account.');
    }

    const { account, accessToken } = accountData;
    if (!accessToken) {
        throw new Error('Access token not found. Please reconnect the account.');
    }

    const platform = interaction.platform;
    let externalReplyId: string | undefined;

    switch (platform) {
        case 'instagram':
        case 'facebook': {
            externalReplyId = await replyViaMetaComment(
                interaction.externalId,
                trimmed,
                accessToken
            );
            break;
        }
        case 'x': {
            externalReplyId = await replyViaX(
                interaction.externalId,
                trimmed,
                accessToken
            );
            break;
        }
        default:
            throw new ReplyNotSupportedError(platform);
    }

    // Mark replied + record usage. `markReplied` also flips status to read.
    const updated = await socialInteractionRepository.markReplied(interactionId);
    await socialAccountRepository.markUsed(account._id ? String(account._id) : interaction.accountId);

    // Assign the responder if not already assigned (best-effort metadata).
    try {
        if (updated && !updated.assignedToUserId) {
            updated.assignedToUserId = userId;
            await updated.save();
        }
    } catch (error) {
        console.error('[social.inbox] failed to set assignee (non-fatal):', error);
    }

    return { interaction: updated ?? interaction, externalReplyId };
}

/**
 * Meta (Instagram + Facebook) comment reply.
 *
 * Both IG and FB comment objects accept `POST /{comment-id}/replies` (IG) or
 * `POST /{comment-id}/comments` (FB). We POST to /{external-id}/comments which
 * the Graph API accepts for both comment and post nodes as a child comment.
 * `external-id` here is the comment / post id the interaction was created from.
 */
async function replyViaMetaComment(
    externalId: string,
    text: string,
    accessToken: string
): Promise<string> {
    const baseUrl = 'https://graph.facebook.com/v18.0';
    const url = `${baseUrl}/${encodeURIComponent(externalId)}/comments`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: accessToken }),
    });

    if (!response.ok) {
        const errorBody = await safeJson(response);
        const detail =
            errorBody?.error?.message || errorBody?.error?.error_user_msg || 'Unknown error';
        throw new Error(`Meta reply failed: ${response.status} - ${detail}`);
    }

    const data = await response.json();
    return data.id as string;
}

/**
 * X (Twitter) reply — create a tweet with `in_reply_to_tweet_id` set to the
 * interaction's external id (the tweet / mention id).
 */
async function replyViaX(
    inReplyToTweetId: string,
    text: string,
    accessToken: string
): Promise<string> {
    const response = await fetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Montr-AI-Studio/1.0',
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            text,
            reply: { in_reply_to_tweet_id: inReplyToTweetId },
        }),
    });

    if (!response.ok) {
        const errorBody = await safeJson(response);
        const detail = errorBody?.detail || errorBody?.title || 'Unknown error';
        throw new Error(`X reply failed: ${response.status} - ${detail}`);
    }

    const data = await response.json();
    return data.data?.id as string;
}

async function safeJson(response: Response): Promise<any | null> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
