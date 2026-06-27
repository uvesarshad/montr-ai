/**
 * Shared helper for OpenAI-compatible providers (xAI, Kimi, Z.ai, DeepSeek).
 *
 * Each provider exposes the OpenAI chat-completions schema at a different
 * baseURL and may carry small response-shape extensions (e.g. DeepSeek's
 * `reasoning_content` field). This module factors out the boilerplate so
 * each provider file is ~30 lines.
 *
 * Build a provider via `makeOpenAICompatibleProvider({ id, baseURL, ... })`.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  ProviderClient,
  ProviderId,
  GenerateTextRequest,
  GenerateTextResult,
  AIUsageInfo,
} from './types';

export interface OpenAICompatibleConfig {
  id: ProviderId;
  baseURL: string;
  /** Whether the provider supports tool/function calling. */
  toolCalling?: boolean;
  /** Whether the provider supports vision (image-in messages). */
  vision?: boolean;
  /**
   * Hook for extracting provider-specific fields from a response message.
   * DeepSeek uses this to split off the `reasoning_content` block.
   */
  extractExtraText?: (message: { content?: string | null; [key: string]: unknown }) => string;
}

export function makeOpenAICompatibleProvider(cfg: OpenAICompatibleConfig): ProviderClient {
  function client(apiKey: string): OpenAI {
    return new OpenAI({ apiKey, baseURL: cfg.baseURL });
  }

  function toMessages(system: string, messages: GenerateTextRequest['messages']): ChatCompletionMessageParam[] {
    const out: ChatCompletionMessageParam[] = [];
    if (system) out.push({ role: 'system', content: system });
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (typeof m.content === 'string') {
        if (m.role === 'user' || m.role === 'assistant') {
          out.push({ role: m.role, content: m.content });
        }
        continue;
      }
      // Multi-part — collapse to text + image_url parts for vision providers,
      // else flatten to text.
      const text = m.content
        .filter(p => (p as { type?: string }).type === 'text')
        .map(p => (p as { text?: string }).text ?? '')
        .join('');
      if (cfg.vision) {
        const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
        for (const part of m.content) {
          const p = part as { type?: string; text?: string; image?: string | URL };
          if (p.type === 'text' && p.text) parts.push({ type: 'text', text: p.text });
          if (p.type === 'image' && p.image) {
            const src = typeof p.image === 'string' ? p.image : p.image.toString();
            parts.push({ type: 'image_url', image_url: { url: src } });
          }
        }
        if (m.role === 'user') out.push({ role: 'user', content: parts });
        else if (m.role === 'assistant') out.push({ role: 'assistant', content: text });
      } else {
        if (m.role === 'user' || m.role === 'assistant') {
          out.push({ role: m.role, content: text });
        }
      }
    }
    return out;
  }

  function extractUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined | null): AIUsageInfo {
    if (!usage) return {};
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    };
  }

  return {
    id: cfg.id,
    sdk: 'native',
    capabilities: {
      text: true,
      image: false,
      video: false,
      audio: false,
      streaming: true,
      toolCalling: cfg.toolCalling ?? true,
      vision: cfg.vision ?? false,
      promptCaching: false,
    },

    async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
      const { route, system, messages, temperature, maxTokens, onFinish } = req;
      const c = client(route.apiKey);
      const response = await c.chat.completions.create({
        model: route.resolvedModelId,
        messages: toMessages(system, messages),
        temperature,
        max_tokens: maxTokens,
      });
      const message = response.choices[0]?.message;
      let text = message?.content ?? '';
      if (cfg.extractExtraText && message) {
        const extra = cfg.extractExtraText(message as { content?: string | null });
        if (extra) text = `${extra}\n\n${text}`;
      }
      const usage = extractUsage(response.usage);
      if (onFinish) {
        await onFinish({
          ...usage,
          finishReason: response.choices[0]?.finish_reason ?? undefined,
        });
      }
      return { text, usage };
    },

    async streamText(req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
      const { route, system, messages, temperature, maxTokens, onFinish } = req;
      const c = client(route.apiKey);
      const stream = await c.chat.completions.create({
        model: route.resolvedModelId,
        messages: toMessages(system, messages),
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });
      return iterate(stream, extractUsage, onFinish);
    },
  };
}

async function* iterate(
  stream: AsyncIterable<unknown>,
  extractUsage: (u: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined | null) => AIUsageInfo,
  onFinish?: (info: AIUsageInfo) => void | Promise<void>
): AsyncGenerator<string> {
  let finishReason: string | undefined;
  let lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  for await (const raw of stream) {
    const chunk = raw as {
      choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
    if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    if (chunk.usage) lastUsage = chunk.usage;
  }
  if (onFinish) {
    await onFinish({ ...extractUsage(lastUsage), finishReason });
  }
}
