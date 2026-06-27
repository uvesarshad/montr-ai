/**
 * Anthropic (Claude) native provider.
 *
 * Uses `@anthropic-ai/sdk` directly — NOT Genkit, NOT AI-SDK — so we can
 * surface Claude-specific features:
 *
 *  - **Prompt caching enabled by default.** System prompts and tool definitions
 *    are marked with `cache_control: { type: 'ephemeral' }`. This unlocks
 *    Anthropic's 90% input-token discount on cache hits, which is the
 *    primary reason to bypass OpenRouter / aggregators.
 *  - Streaming via SSE.
 *  - Vision (image messages).
 *  - Tool calling parity with the AI-SDK `CoreTool` shape.
 *  - Cache usage surfaced through `AIUsageInfo.cacheReadInputTokens` /
 *    `cacheCreationInputTokens` so callers can attribute savings.
 *
 * Model id format: pass plain Anthropic ids like `claude-3-5-sonnet-latest`,
 * `claude-3-5-haiku-latest`, `claude-opus-4-7`. The router resolves them
 * unchanged for the `anthropic` provider id.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  TextBlockParam,
  ImageBlockParam,
  ContentBlockParam,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import type { CoreMessage, CoreTool } from 'ai';
import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  AIUsageInfo,
} from './types';

const DEFAULT_MAX_TOKENS = 4096;

function clientFor(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

/**
 * Convert AI-SDK CoreMessage[] to Anthropic MessageParam[]. The Anthropic API
 * requires `system` as a separate top-level field (not a message), so callers
 * should NOT include role:'system' here.
 */
function toAnthropicMessages(messages: CoreMessage[]): MessageParam[] {
  const result: MessageParam[] = [];
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }
    // Multi-part content (vision / mixed text+image).
    const parts: ContentBlockParam[] = [];
    for (const part of msg.content) {
      const p = part as { type?: string; text?: string; image?: string | URL };
      if (p.type === 'text' && typeof p.text === 'string') {
        parts.push({ type: 'text', text: p.text } as TextBlockParam);
      } else if (p.type === 'image' && p.image) {
        const src = typeof p.image === 'string' ? p.image : p.image.toString();
        parts.push(toImageBlock(src));
      }
    }
    if (parts.length > 0) {
      result.push({ role: msg.role, content: parts });
    }
  }
  return result;
}

function toImageBlock(src: string): ImageBlockParam {
  // Anthropic accepts both base64 inline data and URLs.
  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mediaType = match[1] as ImageBlockParam['source'] extends { media_type?: infer T } ? T : never;
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: match[2],
        },
      };
    }
  }
  return {
    type: 'image',
    source: { type: 'url', url: src },
  };
}

/**
 * Convert AI-SDK `CoreTool` shapes to Anthropic's `Tool` shape. Adds
 * `cache_control` to each tool when caching is enabled — Anthropic caches
 * tool definitions independently of the system prompt.
 */
function toAnthropicTools(
  tools: Record<string, CoreTool> | undefined,
  enableCaching: boolean
): Tool[] | undefined {
  if (!tools) return undefined;
  const list: Tool[] = [];
  for (const [name, def] of Object.entries(tools)) {
    const description = (def as { description?: string }).description ?? '';
    // CoreTool wraps a zod schema; we depend on AI-SDK's `parameters.jsonSchema`
    // convention — the same way the original aisdk path consumed them.
    const parameters = (def as { parameters?: unknown }).parameters as Record<string, unknown> | undefined;
    const tool: Tool = {
      name,
      description,
      input_schema: (parameters ?? { type: 'object', properties: {} }) as Tool['input_schema'],
    };
    if (enableCaching && list.length === Object.entries(tools).length - 1) {
      // Cache the entire tool block by tagging the LAST tool — Anthropic caches
      // everything up to and including the marked block.
      (tool as Tool & { cache_control?: { type: 'ephemeral' } }).cache_control = { type: 'ephemeral' };
    }
    list.push(tool);
  }
  return list;
}

/**
 * Build the system block. When caching is enabled, wrap the system prompt in
 * an array form with `cache_control: ephemeral`. Anthropic's `system` field
 * accepts either a string or an array of TextBlockParam with cache_control.
 */
function buildSystem(system: string, enableCaching: boolean): string | TextBlockParam[] | undefined {
  if (!system) return undefined;
  if (!enableCaching) return system;
  return [
    {
      type: 'text',
      text: system,
      cache_control: { type: 'ephemeral' },
    } as TextBlockParam & { cache_control: { type: 'ephemeral' } },
  ];
}

function extractUsage(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
} | undefined): AIUsageInfo {
  if (!usage) return {};
  return {
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    cacheReadInputTokens: usage.cache_read_input_tokens ?? undefined,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? undefined,
  };
}

export const anthropicProvider: ProviderClient = {
  id: 'anthropic',
  sdk: 'native',
  capabilities: {
    text: true,
    image: false,
    video: false,
    audio: false,
    streaming: true,
    toolCalling: true,
    vision: true,
    promptCaching: true,
  },

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
    const { route, system, messages, temperature, maxTokens, tools, onFinish } = req;
    const enableCaching = req.enablePromptCaching !== false;
    const client = clientFor(route.apiKey);

    const response = await client.messages.create({
      model: route.resolvedModelId,
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature,
      system: buildSystem(system, enableCaching),
      messages: toAnthropicMessages(messages),
      tools: toAnthropicTools(tools, enableCaching),
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('');
    const usage = extractUsage(response.usage);
    if (onFinish) await onFinish({ ...usage, finishReason: response.stop_reason ?? undefined });
    return { text, usage };
  },

  async streamText(req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    const { route, system, messages, temperature, maxTokens, tools, onFinish } = req;
    const enableCaching = req.enablePromptCaching !== false;
    const client = clientFor(route.apiKey);

    const stream = await client.messages.stream({
      model: route.resolvedModelId,
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature,
      system: buildSystem(system, enableCaching),
      messages: toAnthropicMessages(messages),
      tools: toAnthropicTools(tools, enableCaching),
    });

    return iterate(stream, onFinish);
  },
};

async function* iterate(
  stream: ReturnType<Anthropic['messages']['stream']>,
  onFinish?: (info: AIUsageInfo) => void | Promise<void>
): AsyncGenerator<string> {
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text;
    }
  }
  if (onFinish) {
    const final = await stream.finalMessage();
    await onFinish({
      ...extractUsage(final.usage),
      finishReason: final.stop_reason ?? undefined,
    });
  }
}
