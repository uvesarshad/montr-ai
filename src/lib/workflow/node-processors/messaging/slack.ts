/**
 * Slack send-message processor (subType `slack_send`, audit H17).
 *
 * Slack OAuth + the inbox Slack adapter already exist — this node is the builder
 * convenience that lets a workflow post a message to a channel.
 *
 * Bot-token resolution (org-scoped, NEVER client-supplied org):
 *   1. config.credentialId → workflow credential vault ({ botToken } / { token }).
 *   2. config.botToken     → direct token (post variable-resolution; never logged).
 *   3. org's connected Slack inbox channel → InboxChannel(channelType:'slack',
 *      organizationId = execution.organizationId).config.botToken  ← default path,
 *      mirroring how `slack.adapter.ts` reads the channel's bot token.
 *
 * Config:
 *   channel: string            — channel id (C…) or name (#general) [required]
 *   text / message: string     — message text (variable-interpolated by engine)
 *   blocks?: string | array    — optional Block Kit blocks (JSON string or array)
 *   threadTs?: string          — reply into a thread
 *   credentialId? / botToken?  — token overrides (otherwise org connection)
 *   channelId?: string         — explicit inbox-channel id to source the token from
 *
 * Honors `context.dryRun` → { simulated: true, wouldSend } (no API call).
 * Output: ok, ts, channel.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { slackPostMessage } from '@/lib/services/slack.service';
import InboxChannel from '@/lib/db/models/inbox-channel.model';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function parseBlocks(raw: unknown): unknown[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Slack: "blocks" must be valid JSON (array of Block Kit blocks)');
    }
    if (Array.isArray(parsed)) return parsed;
    // Allow `{ blocks: [...] }` shape too.
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.blocks)) return obj.blocks as unknown[];
    throw new Error('Slack: "blocks" JSON must be an array (or { blocks: [...] })');
  }
  return undefined;
}

/** Resolve the org's Slack bot token from a connected inbox channel. */
async function resolveOrgSlackToken(
  explicitChannelId?: string
): Promise<string> {
  const query: Record<string, unknown> = {
    channelType: 'slack',
    isActive: true,
  };
  if (explicitChannelId) query._id = explicitChannelId;

  const channel = await InboxChannel.findOne(query).lean();
  const token = (channel as { config?: { botToken?: string } } | null)?.config?.botToken;
  if (!token) {
    throw new Error(
      'Slack: not connected. Connect Slack in Settings → Inbox channels, or provide a botToken / credentialId.'
    );
  }
  return token;
}

export class SlackSendProcessor implements NodeProcessor {
  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!asString(config.channel)) errors.push('channel is required');
    if (!asString(config.text) && !asString(config.message) && !config.blocks) {
      errors.push('text (or blocks) is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, credentials } = context;

    const channel = asString(config.channel);
    if (!channel) throw new Error('Slack: "channel" is required');

    const text = asString(config.text) ?? asString(config.message) ?? '';
    const blocks = parseBlocks(config.blocks);
    const threadTs = asString(config.threadTs);

    if (context.dryRun) {
      return {
        simulated: true,
        sent: false,
        wouldSend: { type: 'slack', channel, text, blocks, threadTs },
        channel,
      };
    }

    // Token: vault → inline → org connection. Org is ALWAYS from the execution.
    const credId = asString(config.credentialId);
    const credBlob = credId && credentials ? credentials[credId] : undefined;
    let botToken =
      (credBlob &&
        (asString(credBlob.botToken) || asString(credBlob.token))) ||
      asString(config.botToken);

    if (!botToken) {
      botToken = await resolveOrgSlackToken(asString(config.channelId));
    }

    const result = await slackPostMessage(
      botToken,
      { channel, text, blocks, threadTs },
      context.abortSignal
    );

    return {
      ok: result.ok,
      ts: result.ts,
      channel: result.channel ?? channel,
    };
  }
}
