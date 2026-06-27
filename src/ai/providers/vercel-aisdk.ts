/**
 * Vercel AI-SDK long-tail provider.
 *
 * Used when a user requests a model that has no native SDK in our matrix —
 * Mistral, Cohere, Together, Fireworks, and others. We accept the AI-SDK
 * lock-in for this tier because they're hard-to-get keys / expensive / used
 * infrequently — not worth hand-writing native integrations.
 *
 * Routing happens by `route.baseURL` — the router sets it from a per-model
 * mapping table or from an env var. If the baseURL is unset, the request
 * falls through to OpenAI's default endpoint (effectively the same as the
 * openai provider). The keys are BYOK-or-system per the standard chain.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText as aiGenerateText, streamText as aiStreamText } from 'ai';
import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
} from './types';

function buildClient(apiKey: string, baseURL?: string) {
  return createOpenAI({
    apiKey,
    baseURL: baseURL ?? 'https://api.openai.com/v1',
  });
}

export const vercelAisdkProvider: ProviderClient = {
  id: 'vercel-aisdk',
  sdk: 'aisdk',
  capabilities: {
    text: true,
    image: false,
    video: false,
    audio: false,
    streaming: true,
    toolCalling: true,
    vision: true, // model-dependent; AI-SDK passes through
    promptCaching: false,
  },

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
    const { route, system, messages, temperature, maxTokens, tools, maxSteps, onFinish } = req;
    const client = buildClient(route.apiKey, route.baseURL);
    const { text, usage, finishReason } = await aiGenerateText({
      model: client(route.resolvedModelId) as unknown as Parameters<typeof aiGenerateText>[0]['model'],
      system,
      messages,
      temperature,
      maxTokens,
      tools,
      maxSteps: maxSteps ?? (tools ? 5 : 1),
    });
    const info = {
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
      finishReason,
    };
    if (onFinish) await onFinish(info);
    return { text, usage: info };
  },

  async streamText(req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    const { route, system, messages, tools, maxSteps, onFinish } = req;
    const client = buildClient(route.apiKey, route.baseURL);
    const { textStream } = await aiStreamText({
      model: client(route.resolvedModelId) as unknown as Parameters<typeof aiStreamText>[0]['model'],
      system,
      messages,
      tools,
      maxSteps: maxSteps ?? (tools ? 5 : 1),
      onFinish: onFinish
        ? async ({ usage, finishReason }) => {
            await onFinish({
              promptTokens: usage?.promptTokens,
              completionTokens: usage?.completionTokens,
              totalTokens: usage?.totalTokens,
              finishReason,
            });
          }
        : undefined,
    });
    return iterate(textStream);
  },
};

async function* iterate(textStream: AsyncIterable<string>): AsyncGenerator<string> {
  for await (const chunk of textStream) yield chunk;
}
