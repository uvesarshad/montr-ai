/**
 * Sarvam provider — multilingual Indian language support.
 *
 * Three capabilities:
 *  - Text (LLM): `sarvam-m`, `sarvam-2b` — OpenAI-compatible chat completions
 *    at `https://api.sarvam.ai/v1/chat/completions`.
 *  - Speech-to-text (STT): `saarika:v2` — `/speech-to-text/transcribe`.
 *  - Text-to-speech (TTS): `bulbul:v2` — `/text-to-speech` returning audio.
 *
 * The non-chat endpoints use `api-subscription-key` as the auth header rather
 * than `Authorization: Bearer`, so we hand-roll the HTTP calls instead of
 * reusing the OpenAI SDK for STT/TTS. The chat endpoint is Bearer-compatible
 * and goes through the OpenAI SDK with a baseURL override.
 *
 * Voice subsystem (Bundle 3) consumes Sarvam's STT/TTS for Indian-language
 * voice bots — see [bundle-3-voice-tasks.md](temp/audit/bundle-3-voice-tasks.md)
 * Phase 5.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateAudioRequest,
  GenerateAudioResult,
  TranscribeAudioRequest,
  TranscribeAudioResult,
  AIUsageInfo,
} from './types';

const SARVAM_BASE = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai';

function chatClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: `${SARVAM_BASE}/v1`,
  });
}

function toChatMessages(system: string, messages: GenerateTextRequest['messages']): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'system') continue;
    const content = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map(p => (p as { text?: string }).text ?? '').join('')
        : '';
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content });
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

export const sarvamProvider: ProviderClient = {
  id: 'sarvam',
  sdk: 'native',
  capabilities: {
    text: true,
    image: false,
    video: false,
    audio: true,
    transcription: true,
    streaming: true,
    toolCalling: false,
    vision: false,
    promptCaching: false,
  },

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
    const { route, system, messages, temperature, maxTokens, onFinish } = req;
    const client = chatClient(route.apiKey);
    const response = await client.chat.completions.create({
      model: route.resolvedModelId,
      messages: toChatMessages(system, messages),
      temperature,
      max_tokens: maxTokens,
    });
    const text = response.choices[0]?.message?.content ?? '';
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
    const client = chatClient(route.apiKey);
    const stream = await client.chat.completions.create({
      model: route.resolvedModelId,
      messages: toChatMessages(system, messages),
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });
    return iterateOpenAIStream(stream, onFinish);
  },

  /**
   * Sarvam TTS (`bulbul:v2`). Returns the synthesized audio as a base64 data URL.
   * `voice` maps to Sarvam's `speaker` field; `language` to `target_language_code`.
   */
  async generateAudio(req: GenerateAudioRequest): Promise<GenerateAudioResult> {
    const { route, text, voice, language } = req;
    const response = await fetch(`${SARVAM_BASE}/text-to-speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': route.apiKey,
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: language ?? 'hi-IN',
        speaker: voice ?? 'meera',
        model: route.resolvedModelId.includes('bulbul') ? route.resolvedModelId : 'bulbul:v2',
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Sarvam TTS failed (${response.status}): ${err}`);
    }
    const json = await response.json() as { audios?: string[] };
    const base64 = json.audios?.[0];
    if (!base64) throw new Error('Sarvam TTS returned no audio');
    return {
      audioUrl: `data:audio/wav;base64,${base64}`,
      mimeType: 'audio/wav',
    };
  },

  /**
   * Sarvam STT (`saarika:v2`). Accepts URL or raw bytes; sends as multipart.
   */
  async transcribeAudio(req: TranscribeAudioRequest): Promise<TranscribeAudioResult> {
    const { route, audio, mimeType, language } = req;
    const blob = await audioToBlob(audio, mimeType);
    const form = new FormData();
    form.append('file', blob, 'audio.wav');
    form.append('model', route.resolvedModelId.includes('saarika') ? route.resolvedModelId : 'saarika:v2');
    if (language) form.append('language_code', language);

    const response = await fetch(`${SARVAM_BASE}/speech-to-text/transcribe`, {
      method: 'POST',
      headers: { 'api-subscription-key': route.apiKey },
      body: form,
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Sarvam STT failed (${response.status}): ${err}`);
    }
    const json = await response.json() as { transcript?: string; language_code?: string };
    return {
      text: json.transcript ?? '',
      language: json.language_code,
    };
  },
};

async function audioToBlob(audio: string | Buffer | Uint8Array, mimeType?: string): Promise<Blob> {
  let bytes: Uint8Array;
  let detectedMime = mimeType ?? 'audio/wav';
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
  return new Blob([bytes as BlobPart], { type: detectedMime });
}

async function* iterateOpenAIStream(
  stream: AsyncIterable<unknown>,
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
