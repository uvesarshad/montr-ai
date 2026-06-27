/**
 * Slack service layer.
 *
 * Thin wrapper around the Slack Web API (`chat.postMessage`). Used by the
 * `slack_send` workflow node. Outbound calls go through `safeOutboundFetch`
 * (DNS-pinned / SSRF-guarded) — `slack.com/api` is a fixed public host but we
 * validate for defense-in-depth, matching the integration service layer idiom.
 *
 * Slack signals failure with HTTP 200 + `{ ok: false, error }`, so success must
 * be asserted on the JSON body, not the HTTP status.
 */

import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

const SLACK_API = 'https://slack.com/api';

export interface SlackPostMessageInput {
  /** Channel id (C…) or name (#general). */
  channel: string;
  /** Message text (already variable-interpolated by the caller). */
  text: string;
  /** Optional Block Kit blocks array. */
  blocks?: unknown[];
  /** Reply into a thread. */
  threadTs?: string;
}

export interface SlackPostMessageResult {
  ok: boolean;
  ts?: string;
  channel?: string;
}

/** POST chat.postMessage with a bot token. Throws on Slack `ok:false`. */
export async function slackPostMessage(
  botToken: string,
  input: SlackPostMessageInput,
  signal?: AbortSignal
): Promise<SlackPostMessageResult> {
  if (!botToken) throw new Error('Slack: a bot token is required');
  const channel = String(input.channel || '').trim();
  if (!channel) throw new Error('Slack: "channel" is required');
  if (!input.text && !(Array.isArray(input.blocks) && input.blocks.length)) {
    throw new Error('Slack: "text" or "blocks" is required');
  }

  const payload: Record<string, unknown> = { channel, text: input.text || '' };
  if (Array.isArray(input.blocks) && input.blocks.length) payload.blocks = input.blocks;
  if (input.threadTs) payload.thread_ts = input.threadTs;

  const res = await safeOutboundFetch(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(payload),
    signal: signal ?? AbortSignal.timeout(15_000),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Slack API: ${res.status} ${res.statusText}`);
  }
  if (data.ok !== true) {
    throw new Error(`Slack chat.postMessage failed: ${String(data.error || 'unknown_error')}`);
  }
  return {
    ok: true,
    ts: data.ts as string | undefined,
    channel: data.channel as string | undefined,
  };
}
