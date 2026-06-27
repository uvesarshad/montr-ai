/**
 * Instagram DM processor.
 *
 * Sends a direct message via Meta's Graph API (Instagram Messaging API).
 * Requires:
 *   - A Facebook page access token with `instagram_manage_messages` scope, AND
 *   - The Instagram user ID of the *sender* (the business account).
 * Both come from a stored credential or inline config.
 *
 * Config:
 *   credentialId?: string             — credential map key holding { accessToken, igUserId }
 *   accessToken?: string              — direct access token (post-resolution)
 *   igUserId?: string                 — IG business account user id
 *   recipientId: string               — IG scoped user id of the message target
 *   text?: string                     — message body (required unless mediaUrl set)
 *   mediaUrl?: string                 — image/video URL to send instead of text
 *   mediaType?: 'image' | 'video'     — hint for mediaUrl (default 'image')
 *   quickReplies?: Array<{ title, payload }>
 *
 * Notes:
 *   - IG Graph API path: POST /v19.0/{ig-user-id}/messages
 *   - Rate limits apply; we don't implement retries here (engine handles).
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { assertSafeOutboundUrl, safeOutboundFetch } from '../../ssrf-guard';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

interface CredentialBlob {
  accessToken?: string;
  token?: string;
  igUserId?: string;
  userId?: string;
}

export class InstagramDMProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;

    const credBlob: CredentialBlob | undefined =
      (config.credentialId && credentials?.[config.credentialId as string]) as CredentialBlob | undefined;

    const accessToken: string =
      (credBlob && (credBlob.accessToken || credBlob.token)) ||
      (config.accessToken as string | undefined) ||
      '';
    const igUserId: string =
      (credBlob && (credBlob.igUserId || credBlob.userId)) ||
      (config.igUserId as string | undefined) ||
      '';

    if (!accessToken) {
      throw new Error('Instagram DM: access token is required');
    }
    if (!igUserId) {
      throw new Error('Instagram DM: IG user ID is required');
    }
    const recipientId = String(config.recipientId || '').trim();
    if (!recipientId) {
      throw new Error('Instagram DM: "recipientId" is required');
    }

    const text = String(config.text ?? '').trim();
    const mediaUrl = String(config.mediaUrl ?? '').trim();
    if (!text && !mediaUrl) {
      throw new Error('Instagram DM: either "text" or "mediaUrl" is required');
    }

    // Build message payload
    const message: Record<string, unknown> = {};
    if (mediaUrl) {
      await assertSafeOutboundUrl(mediaUrl);
      const mediaType = config.mediaType === 'video' ? 'video' : 'image';
      message.attachment = {
        type: mediaType,
        payload: { url: mediaUrl, is_reusable: false },
      };
    } else {
      message.text = text;
    }

    if (Array.isArray(config.quickReplies) && config.quickReplies.length > 0) {
      message.quick_replies = (config.quickReplies as Array<Record<string, unknown>>)
        .slice(0, 13)
        .map((qr) => ({
          content_type: 'text',
          title: String(qr.title || '').slice(0, 20),
          payload: String(qr.payload || qr.title || ''),
        }));
    }

    const url = `${GRAPH_API}/${encodeURIComponent(igUserId)}/messages`;

    const response = await safeOutboundFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const errData = data?.error as Record<string, unknown> | undefined;
      const err = errData?.message || response.statusText;
      throw new Error(`Instagram DM send failed: ${response.status} — ${err}`);
    }

    return {
      success: true,
      messageId: (data as Record<string, unknown>)?.message_id,
      recipientId,
      sentAt: new Date().toISOString(),
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.recipientId) errors.push('recipientId is required');
    if (!config.text && !config.mediaUrl) errors.push('text or mediaUrl is required');
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
