/**
 * OpenRouter provider — used for the free plan tier and as the long-tail
 * fallback when a model has no native SDK. Wraps the AI-SDK (Vercel) under
 * the hood with the OpenRouter base URL.
 *
 * Plan-tier gating happens in the router, not here. By the time a request
 * reaches this provider, the caller has already been allowed.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText as aiGenerateText, streamText as aiStreamText } from 'ai';
import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
} from './types';

function openrouterClient(apiKey: string) {
  return createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    headers: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Montr AI',
    },
  });
}

export const openrouterProvider: ProviderClient = {
  id: 'openrouter',
  sdk: 'openrouter',
  capabilities: {
    text: true,
    image: false,
    video: false,
    audio: false,
    streaming: true,
    toolCalling: true,
    vision: true, // depends on selected model; OpenRouter passes through
    promptCaching: false,
  },

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
    const { route, system, messages, temperature, maxTokens, tools, maxSteps, onFinish } = req;
    const client = openrouterClient(route.apiKey);
    const { text, usage, finishReason } = await aiGenerateText({
      // @ai-sdk/openai and `ai` ship divergent LanguageModelV1 signatures —
      // cast through unknown to bridge the version skew. Same workaround as
      // the original client.ts.
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
    const client = openrouterClient(route.apiKey);
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

    return iterateStream(textStream);
  },
};

async function* iterateStream(textStream: AsyncIterable<string>): AsyncGenerator<string> {
  for await (const chunk of textStream) yield chunk;
}
