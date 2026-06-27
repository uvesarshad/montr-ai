/**
 * Telegram send-message processor.
 *
 * Uses the official Telegram Bot HTTP API directly (no SDK dependency). The
 * bot token is expected to come from the workflow credentials map under a key
 * matching the node's credentialId, OR inline `config.botToken` (which we treat
 * as a template-resolved value — never log it).
 *
 * Config:
 *   credentialId?: string      — credential map key holding `{ botToken }`
 *   botToken?: string          — direct token (post variable resolution)
 *   chatId: string | number    — required
 *   text: string               — required, ≤4096 chars after trim
 *   parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
 *   disableWebPagePreview?: boolean
 *   disableNotification?: boolean
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_TEXT_LEN = 4096;

export class SendTelegramProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;

    const credId: string | undefined = config.credentialId as string | undefined;
    const credBlob = credId && credentials ? credentials[credId] : undefined;
    const botToken: string =
      (credBlob && ((credBlob.botToken as string | undefined) || (credBlob.token as string | undefined))) ||
      (config.botToken as string | undefined) ||
      '';

    if (!botToken || typeof botToken !== 'string') {
      throw new Error('Telegram: bot token is required (set via credential or config.botToken).');
    }

    const chatId = config.chatId;
    if (chatId === undefined || chatId === null || chatId === '') {
      throw new Error('Telegram: "chatId" is required.');
    }

    const text = String(config.text ?? '');
    if (!text.trim()) {
      throw new Error('Telegram: "text" is required.');
    }

    const url = `${TELEGRAM_API}/bot${encodeURIComponent(botToken)}/sendMessage`;

    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: text.slice(0, MAX_TEXT_LEN),
    };
    if (config.parseMode) body.parse_mode = config.parseMode;
    if (config.disableWebPagePreview) body.disable_web_page_preview = true;
    if (config.disableNotification) body.disable_notification = true;

    // Defense in depth — Telegram's API is on a public IP, but safeOutboundFetch
    // still validates + pins DNS so an env-spoofed TELEGRAM_API can't redirect us
    // to private space.
    const response = await safeOutboundFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || data?.ok !== true) {
      throw new Error(
        `Telegram sendMessage failed: ${response.status} ${response.statusText} — ${(data?.description as string | undefined) || 'unknown error'}`
      );
    }

    const result = data.result as Record<string, unknown> | undefined;
    const resultChat = result?.chat as Record<string, unknown> | undefined;
    return {
      success: true,
      messageId: result?.message_id,
      chatId: resultChat?.id,
      date: result?.date,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.chatId) errors.push('chatId is required');
    if (!config.text || !String(config.text).trim()) errors.push('text is required');
    if (!config.credentialId && !config.botToken) {
      errors.push('Either credentialId or botToken must be set');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
