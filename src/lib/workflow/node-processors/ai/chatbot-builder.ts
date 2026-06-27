/**
 * Chatbot Builder processor.
 *
 * Hybrid rule-based + AI chatbot runtime. Given an incoming user message,
 * tries each configured quick reply rule (exact / keyword match) first; if
 * none match and `aiFallback` is true, delegates to the generate-text flow
 * with the configured system prompt.
 *
 * Config:
 *   platform?: string                    — informational: whatsapp/telegram/instagram/web
 *   welcomeMessage?: string              — returned when no user message yet (empty input)
 *   quickReplies?: Array<QuickReply>     — structured reply rules
 *   aiFallback?: boolean                 — if true, unmatched messages go to AI
 *   systemPrompt?: string                — AI persona
 *   model?: string                       — default openai/gpt-4o
 *   temperature?: number
 *   userMessage?: string                 — incoming message (usually templated)
 *
 * QuickReply:
 *   { label?: string, keyword?: string, keywords?: string[], response: string }
 *   — `keywords` match if the user message (lowercased) contains any of them.
 *   — `keyword` is a single-keyword shorthand.
 *   — `label` is the button label; bare strings in `quickReplies` are treated
 *      as labels with keyword = label (legacy compatibility).
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { generateText } from '../../../../ai/flows/generate-text-flow';

interface QuickReply {
  label?: string;
  keyword?: string;
  keywords?: string[];
  response?: string;
}

function normalizeQuickReplies(raw: unknown): QuickReply[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickReply[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const kw = item.trim();
      if (kw) out.push({ label: kw, keyword: kw.toLowerCase() });
      continue;
    }
    if (item && typeof item === 'object') {
      const qr = item as QuickReply;
      out.push({
        label: qr.label,
        keyword: qr.keyword?.toLowerCase(),
        keywords: Array.isArray(qr.keywords)
          ? qr.keywords.map((k) => String(k).toLowerCase())
          : undefined,
        response: qr.response,
      });
    }
  }
  return out;
}

export class ChatbotBuilderProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const userMessage = String(config.userMessage ?? '').trim();
    const welcomeMessage = String(config.welcomeMessage ?? '');
    const quickReplies = normalizeQuickReplies(config.quickReplies);
    const aiFallback: boolean = !!config.aiFallback;

    // Empty input → return welcome
    if (!userMessage) {
      return {
        success: true,
        matched: false,
        reply: welcomeMessage,
        source: 'welcome',
        quickReplies: quickReplies.map((q) => q.label).filter(Boolean),
      };
    }

    const lower = userMessage.toLowerCase();

    // Rule match
    for (const qr of quickReplies) {
      const keys = [
        ...(qr.keywords || []),
        ...(qr.keyword ? [qr.keyword] : []),
        ...(qr.label ? [qr.label.toLowerCase()] : []),
      ];
      if (keys.some((k) => k && lower.includes(k))) {
        const reply = qr.response || qr.label || '';
        return {
          success: true,
          matched: true,
          matchedLabel: qr.label,
          reply,
          source: 'rule',
        };
      }
    }

    // AI fallback
    if (!aiFallback) {
      return {
        success: true,
        matched: false,
        reply: '',
        source: 'no_match',
        quickReplies: quickReplies.map((q) => q.label).filter(Boolean),
      };
    }

    const model = config.model || 'openai/gpt-4o';
    const systemPrompt =
      config.systemPrompt ||
      'You are a helpful chatbot. Answer concisely and politely.';

    const result = await generateText({
      prompt: userMessage,
      model,
      context: '',
      systemPrompt,
      temperature: config.temperature as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      userProfile: undefined,
      userPlan: undefined,
      userApiKeys: undefined,
      routeHint: null,
    } as Parameters<typeof generateText>[0]);

    const reply = (result?.text || '').trim();
    await execution.updateVariable('chatbot_builder_reply', reply).catch(() => {});

    return {
      success: true,
      matched: false,
      reply,
      source: 'ai',
      model,
      creditsUsed: result?.creditsUsed,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const qrs = normalizeQuickReplies(config.quickReplies);
    if (!config.aiFallback && qrs.length === 0 && !config.welcomeMessage) {
      errors.push('Configure at least quickReplies, aiFallback, or welcomeMessage');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
