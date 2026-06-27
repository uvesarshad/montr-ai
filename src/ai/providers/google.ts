/**
 * Google AI provider.
 *
 * TEXT (2026-06-06): routed through the Vercel AI SDK against Gemini's
 * OpenAI-compatible endpoint so `tools` and `maxSteps` ACTUALLY bind — the
 * previous Genkit path flattened everything into one string prompt and
 * silently dropped tools, which made agent turns roleplay tool calls instead
 * of executing them. Same GEMINI_API_KEY, real function calling.
 *
 * IMAGE/VIDEO: stay on Genkit (`@genkit-ai/googleai`) — Imagen and Veo aren't
 * served by the OpenAI-compatible surface.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText as aiGenerateText, streamText as aiStreamText } from 'ai';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { ai as systemAi } from '../genkit';
import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateImageRequest,
  GenerateImageResult,
  GenerateVideoRequest,
  GenerateVideoJob,
} from './types';

const GEMINI_OPENAI_COMPAT_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';

function aisdkClient(apiKey: string) {
  return createOpenAI({ baseURL: GEMINI_OPENAI_COMPAT_BASE, apiKey });
}

/** The router may hand over genkit-style ids ('googleai/gemini-2.5-flash') — the API wants the bare id. */
function nativeModelId(modelId: string): string {
  return modelId.replace(/^googleai\//, '').replace(/^google\//, '');
}

function clientFor(apiKey: string, keySource: 'user' | 'system') {
  if (keySource === 'user') {
    return genkit({ plugins: [googleAI({ apiKey })] });
  }
  return systemAi;
}

function genkitModelId(modelId: string): string {
  return modelId.startsWith('googleai/') ? modelId : `googleai/${modelId}`;
}

export const googleProvider: ProviderClient = {
  id: 'google',
  sdk: 'genkit',
  capabilities: {
    text: true,
    image: true,
    video: true, // Veo — wired through Genkit's googleAI plugin where available
    audio: false,
    streaming: true,
    // Real tool binding via the OpenAI-compatible Gemini endpoint (2026-06-06).
    toolCalling: true,
    vision: true,
    promptCaching: false,
  },

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
    const { route, system, messages, temperature, maxTokens, tools, maxSteps, onFinish } = req;
    const client = aisdkClient(route.apiKey);
    const { text, usage, finishReason } = await aiGenerateText({
      // @ai-sdk/openai and `ai` ship divergent LanguageModelV1 signatures —
      // cast through unknown to bridge the version skew (same as openrouter.ts).
      model: client(nativeModelId(route.resolvedModelId)) as unknown as Parameters<typeof aiGenerateText>[0]['model'],
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
    const { route, system, messages, temperature, maxTokens, tools, maxSteps, onFinish } = req;
    const client = aisdkClient(route.apiKey);
    const { textStream } = await aiStreamText({
      model: client(nativeModelId(route.resolvedModelId)) as unknown as Parameters<typeof aiStreamText>[0]['model'],
      system,
      messages,
      temperature,
      maxTokens,
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

  /**
   * Imagen 4 image generation via Genkit. Returns the data URL Genkit emits.
   * `count` is ignored — Imagen returns one image per call. For multiple
   * images, the orchestration layer (B2-3.11) batches calls.
   */
  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
    const { route, prompt, aspectRatio, negativePrompt } = req;
    const client = clientFor(route.apiKey, route.keySource);
    const config: Record<string, unknown> = {};
    if (aspectRatio) config.aspectRatio = aspectRatio;
    if (negativePrompt) config.negativePrompt = negativePrompt;

    const response = await client.generate({
      model: genkitModelId(route.resolvedModelId),
      prompt,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
    const url = (response as { media?: { url?: string } }).media?.url;
    if (!url) throw new Error('Imagen returned no image URL.');
    return { images: [url] };
  },

  /**
   * Veo video generation via Genkit. Veo is a long-running operation: the
   * Genkit response carries an operation handle the orchestration layer
   * polls. For now we surface the synchronous shape when Genkit returns a
   * URL inline (small previews) and fall back to processing otherwise. The
   * worker can call into Genkit's operation API for the polling path.
   */
  async generateVideo(req: GenerateVideoRequest): Promise<GenerateVideoJob> {
    const { route, prompt } = req;
    const client = clientFor(route.apiKey, route.keySource);
    const config: Record<string, unknown> = {};
    if (req.aspectRatio) config.aspectRatio = req.aspectRatio;
    if (req.durationSeconds) config.durationSeconds = req.durationSeconds;

    const response = await client.generate({
      model: genkitModelId(route.resolvedModelId),
      prompt,
      config: Object.keys(config).length > 0 ? config : undefined,
    }) as { media?: { url?: string }; operation?: { name?: string } };

    if (response.media?.url) {
      return { jobId: 'inline', status: 'completed', videoUrl: response.media.url };
    }
    if (response.operation?.name) {
      return { jobId: response.operation.name, status: 'processing' };
    }
    return { jobId: 'inline', status: 'failed', error: 'Veo returned no URL or operation handle.' };
  },
};

async function* iterateStream(textStream: AsyncIterable<string>): AsyncGenerator<string> {
  for await (const chunk of textStream) yield chunk;
}
