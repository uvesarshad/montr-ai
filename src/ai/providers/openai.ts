/**
 * OpenAI provider.
 *
 * Text generation routes through the Vercel AI SDK (2026-06-06) so tools and
 * maxSteps ACTUALLY bind — the previous Genkit path flattened everything into
 * a single string prompt and silently dropped `tools`, which made agent turns
 * roleplay tool calls instead of executing them. Image/TTS/transcription stay
 * on the native `openai` SDK.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText as aiGenerateText, streamText as aiStreamText } from 'ai';
import OpenAI from 'openai';
import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateImageRequest,
  GenerateImageResult,
  GenerateAudioRequest,
  GenerateAudioResult,
  TranscribeAudioRequest,
  TranscribeAudioResult,
} from './types';

function aisdkClient(apiKey: string) {
  return createOpenAI({ apiKey });
}

/** The router may hand over genkit-style ids ('openai/gpt-4o') — the OpenAI API wants the bare id. */
function nativeModelId(modelId: string): string {
  return modelId.replace(/^openai\//, '');
}

export const openaiProvider: ProviderClient = {
  id: 'openai',
  sdk: 'aisdk',
  capabilities: {
    text: true,
    image: true,
    video: false,
    audio: true,
    transcription: true,
    streaming: true,
    toolCalling: true,
    vision: true,
    promptCaching: true, // OpenAI's automatic prompt caching (50%+ discount on long prompts)
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
   * DALL-E 3 image generation. Genkit's `genkitx-openai` plugin doesn't surface
   * image gen, so we fall through to the native `openai` SDK here. Returns
   * URLs (OpenAI hosts the rendered images for ~60 minutes).
   */
  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
    const { route, prompt, count } = req;
    const client = new OpenAI({ apiKey: route.apiKey });
    const response = await client.images.generate({
      model: route.resolvedModelId.includes('dall-e') ? route.resolvedModelId.replace(/^openai\//, '') : 'dall-e-3',
      prompt,
      n: Math.min(count ?? 1, 1), // DALL-E 3 only supports n=1
      size: dalleSizeForAspect(req.aspectRatio),
    });
    const images = (response.data ?? []).map(d => d.url).filter((u): u is string => !!u);
    return { images };
  },

  /**
   * OpenAI TTS (gpt-4o-mini-tts / tts-1 / tts-1-hd). Returns a data URL the
   * caller can stream or persist to S3.
   */
  async generateAudio(req: GenerateAudioRequest): Promise<GenerateAudioResult> {
    const { route, text, voice, speed } = req;
    const client = new OpenAI({ apiKey: route.apiKey });
    const ttsModel = route.resolvedModelId.includes('tts')
      ? route.resolvedModelId.replace(/^openai\//, '')
      : 'gpt-4o-mini-tts';
    const response = await client.audio.speech.create({
      model: ttsModel,
      voice: (voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer') ?? 'alloy',
      input: text,
      speed,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
      mimeType: 'audio/mpeg',
    };
  },

  /**
   * Whisper transcription (or gpt-4o-mini-transcribe when the route specifies it).
   * Accepts either an audio URL or a Buffer / Uint8Array of raw bytes.
   */
  async transcribeAudio(req: TranscribeAudioRequest): Promise<TranscribeAudioResult> {
    const { route, audio, mimeType, language, withTimestamps } = req;
    const client = new OpenAI({ apiKey: route.apiKey });

    const audioFile = await toFile(audio, mimeType);
    const sttModel = route.resolvedModelId.includes('transcribe') || route.resolvedModelId.includes('whisper')
      ? route.resolvedModelId.replace(/^openai\//, '')
      : 'whisper-1';

    const response = await client.audio.transcriptions.create({
      model: sttModel,
      file: audioFile,
      language,
      response_format: withTimestamps ? 'verbose_json' : 'json',
      timestamp_granularities: withTimestamps ? ['segment'] : undefined,
    });

    const verboseResponse = response as unknown as {
      text: string;
      language?: string;
      segments?: Array<{ text: string; start: number; end: number }>;
    };
    return {
      text: verboseResponse.text,
      language: verboseResponse.language,
      segments: verboseResponse.segments,
    };
  },
};

/**
 * Normalize a transcription input into a `File`. Handles URLs (fetched server-side),
 * raw Buffer / Uint8Array (wrapped with a synthetic filename), and data URLs.
 */
async function toFile(
  audio: string | Buffer | Uint8Array,
  mimeType?: string
): Promise<File> {
  let bytes: Uint8Array;
  let detectedMime = mimeType ?? 'audio/mpeg';
  if (typeof audio === 'string') {
    if (audio.startsWith('data:')) {
      const match = audio.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('Invalid audio data URL');
      detectedMime = match[1];
      bytes = Buffer.from(match[2], 'base64');
    } else {
      const res = await fetch(audio);
      if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      detectedMime = res.headers.get('content-type') ?? detectedMime;
    }
  } else {
    bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  }
  const ext = detectedMime.split('/')[1]?.split(';')[0] ?? 'mp3';
  return new File([bytes as BlobPart], `audio.${ext}`, { type: detectedMime });
}

/**
 * Map our aspect-ratio shorthand to DALL-E 3's supported sizes.
 * DALL-E 3 supports: 1024x1024 (1:1), 1792x1024 (16:9), 1024x1792 (9:16).
 */
function dalleSizeForAspect(aspectRatio?: string): '1024x1024' | '1792x1024' | '1024x1792' {
  switch (aspectRatio) {
    case '16:9': return '1792x1024';
    case '9:16': return '1024x1792';
    case '1:1':
    default:
      return '1024x1024';
  }
}

async function* iterateStream(textStream: AsyncIterable<string>): AsyncGenerator<string> {
  for await (const chunk of textStream) yield chunk;
}
