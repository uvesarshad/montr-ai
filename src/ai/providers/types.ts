/**
 * Provider abstraction types — shared by every entry in `src/ai/providers/`.
 *
 * Goal: every AI provider — Genkit-backed (Google, OpenAI), native SDK (Claude,
 * Grok, Sarvam, Kimi, Z.ai, DeepSeek), AI-SDK long-tail (Mistral, Cohere,…),
 * and OpenRouter (free-plan fallback) — implements the SAME `ProviderClient`
 * shape. The router (`src/ai/router.ts`) picks the right client at runtime;
 * call sites stay provider-agnostic.
 *
 * Not every provider supports every capability. Image / video / audio are
 * optional methods. Callers should `if (client.generateImage)` before using.
 */

import type { CoreMessage, CoreTool } from 'ai';
import type { ApiKeys } from '../types';

// ---------------------------------------------------------------------------
// Common shapes
// ---------------------------------------------------------------------------

export interface AIUsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
  /** Provider-specific cache metadata (Anthropic prompt caching, OpenAI prompt cache, …). */
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type ProviderId =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'xai'
  | 'sarvam'
  | 'kimi'
  | 'zai'
  | 'deepseek'
  | 'openrouter'
  | 'vercel-aisdk'
  // Video providers (B2-3.15)
  | 'runway'
  | 'pika'
  | 'luma'
  | 'kling'
  | 'seedance'
  // Image providers (B2-3.16)
  | 'replicate'
  | 'ideogram'
  // Voice provider (B2-3.17)
  | 'elevenlabs'
  // Talking-avatar providers (AI Studio revamp M2)
  | 'did'
  | 'heygen';

export type ProviderSdk = 'genkit' | 'native' | 'aisdk' | 'openrouter';

export type KeySource = 'user' | 'system';

/**
 * A resolved routing decision. Built by the router and consumed by provider
 * clients. Carries the actual API key string so providers don't reach into
 * env vars or user profiles themselves.
 */
export interface ResolvedRoute {
  provider: ProviderId;
  sdk: ProviderSdk;
  keySource: KeySource;
  apiKey: string;
  /** Optional base URL override (for OpenAI-compatible endpoints like xAI, DeepSeek). */
  baseURL?: string;
  /** Model id in the form the provider expects (already mapped — e.g. `googleai/gemini-…`). */
  resolvedModelId: string;
}

// ---------------------------------------------------------------------------
// Text generation
// ---------------------------------------------------------------------------

export interface GenerateTextRequest {
  route: ResolvedRoute;
  system: string;
  messages: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: Record<string, CoreTool>;
  maxSteps?: number;
  /**
   * When set, the provider should enable prompt caching for the system prompt
   * and tool definitions (currently only Anthropic supports this natively).
   * Other providers ignore the flag.
   */
  enablePromptCaching?: boolean;
  onFinish?: (info: AIUsageInfo) => void | Promise<void>;
}

export interface GenerateTextResult {
  text: string;
  usage?: AIUsageInfo;
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

export interface GenerateImageRequest {
  route: ResolvedRoute;
  prompt: string;
  /** Optional reference image (URL or data URL) for editing / variation flows. */
  referenceImage?: string;
  /** Aspect ratio shorthand (`1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`). */
  aspectRatio?: string;
  /** Number of images to generate (provider may clamp). */
  count?: number;
  /** Negative prompt — supported by Flux/SD; ignored elsewhere. */
  negativePrompt?: string;
}

export interface GenerateImageResult {
  /** URLs the caller can download / display. */
  images: string[];
  usage?: AIUsageInfo;
}

// ---------------------------------------------------------------------------
// Video generation
// ---------------------------------------------------------------------------

export interface GenerateVideoRequest {
  route: ResolvedRoute;
  prompt: string;
  /** Optional first-frame reference image. */
  referenceImage?: string;
  /** Duration in seconds (provider may clamp). */
  durationSeconds?: number;
  /** Aspect ratio shorthand. */
  aspectRatio?: string;
}

export interface GenerateVideoJob {
  /** Job id the caller polls or receives a webhook callback for. */
  jobId: string;
  /** Initial state — `processing` for async providers, `completed` for sync ones. */
  status: 'processing' | 'completed' | 'failed';
  /** Populated when status === 'completed'. */
  videoUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Talking-avatar video (script + character identity → presenter video)
// ---------------------------------------------------------------------------

export interface GenerateAvatarVideoRequest {
  route: ResolvedRoute;
  /** The lines the avatar speaks. */
  script: string;
  /** Photo-driven mode: portrait the provider animates (D-ID / Hedra style). */
  sourceImageUrl?: string;
  /** Preset mode: provider-catalog avatar id (HeyGen / Synthesia style). */
  providerAvatarId?: string;
  /** Provider-side voice / speaker id. */
  voiceId?: string;
  /** ISO language code. */
  language?: string;
  /** Aspect ratio shorthand. */
  aspectRatio?: string;
}

// Reuses GenerateVideoJob (jobId + status + videoUrl) for the async render.

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export interface GenerateAudioRequest {
  route: ResolvedRoute;
  text: string;
  voice?: string;
  /** Playback speed 0.5–2.0. */
  speed?: number;
  /** ISO language code for TTS providers that support per-language voices. */
  language?: string;
}

export interface GenerateAudioResult {
  audioUrl: string;
  mimeType: string;
  usage?: AIUsageInfo;
}

// ---------------------------------------------------------------------------
// Speech-to-text (transcription)
// ---------------------------------------------------------------------------

export interface TranscribeAudioRequest {
  route: ResolvedRoute;
  /** Source audio. Either a URL or a Buffer / Uint8Array of raw bytes. */
  audio: string | Buffer | Uint8Array;
  /** Optional MIME type (mp3, wav, m4a, webm…) — providers fall back to sniffing. */
  mimeType?: string;
  /** ISO language hint (improves accuracy for accented speech). */
  language?: string;
  /** When true, return per-sentence segments with timestamps. */
  withTimestamps?: boolean;
}

export interface TranscribeAudioResult {
  text: string;
  language?: string;
  /** Populated when `withTimestamps: true`. */
  segments?: Array<{ text: string; start: number; end: number }>;
  usage?: AIUsageInfo;
}

// ---------------------------------------------------------------------------
// Provider client contract
// ---------------------------------------------------------------------------

export interface ProviderClient {
  readonly id: ProviderId;
  readonly sdk: ProviderSdk;
  readonly capabilities: {
    text: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    /** True if the provider can transcribe audio → text. */
    transcription?: boolean;
    /** True if the provider renders talking-avatar video from a script. */
    avatarVideo?: boolean;
    streaming: boolean;
    toolCalling: boolean;
    vision: boolean;
    promptCaching: boolean;
  };

  generateText(req: GenerateTextRequest): Promise<GenerateTextResult>;
  streamText(req: GenerateTextRequest): Promise<AsyncGenerator<string>>;

  generateImage?(req: GenerateImageRequest): Promise<GenerateImageResult>;
  generateVideo?(req: GenerateVideoRequest): Promise<GenerateVideoJob>;
  generateAudio?(req: GenerateAudioRequest): Promise<GenerateAudioResult>;
  transcribeAudio?(req: TranscribeAudioRequest): Promise<TranscribeAudioResult>;

  /** Start a talking-avatar render (async job). */
  generateAvatarVideo?(req: GenerateAvatarVideoRequest): Promise<GenerateVideoJob>;
  /** Poll a talking-avatar render job to a terminal state. */
  pollAvatarVideo?(route: ResolvedRoute, jobId: string): Promise<GenerateVideoJob>;
}

// ---------------------------------------------------------------------------
// Helpers for env / BYOK key resolution
// ---------------------------------------------------------------------------

/**
 * Pull an API key from either user BYOK or system env. Returns `undefined`
 * when both sources are empty so the caller can decide whether to fall back
 * to a different provider.
 */
export function resolveKey(
  provider: ProviderId,
  userKeys: ApiKeys | undefined,
  envVar: string
): { key: string; source: KeySource } | undefined {
  const userKey = (userKeys as Record<string, string | undefined> | undefined)?.[provider];
  if (userKey) return { key: userKey, source: 'user' };
  const sysKey = process.env[envVar];
  if (sysKey) return { key: sysKey, source: 'system' };
  return undefined;
}
