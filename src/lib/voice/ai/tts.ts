/**
 * Text-to-speech adapter interface.
 *
 * A `VoiceTTSClient` turns text into a stream of audio chunks (μ-law/PCM) that
 * the conversation engine pushes back into the call. Implementations wrap
 * ElevenLabs, OpenAI TTS, Sarvam-TTS, or provider-native TTS.
 *
 * Like STT, real routing goes through B2's `src/ai/client.ts` once it supports
 * audio output. The interface here lets us build & test the engine first.
 */

export interface TTSStreamOptions {
  voice?: string;
  encoding?: 'mulaw' | 'pcm16';
  sampleRate?: number;
  /** Cancel the synthesis (e.g. on barge-in). */
  abortSignal?: AbortSignal;
}

export interface VoiceTTSClient {
  /**
   * Synthesize `text` and yield audio chunks. The engine streams the chunks
   * back to the provider's media stream while the user listens.
   */
  stream(text: string, options?: TTSStreamOptions): AsyncIterable<Uint8Array>;
}

/**
 * Stub TTS client — yields nothing. Engine treats this as "instant silent
 * playback" so call flow proceeds. Useful for tests.
 */
export class StubTTSClient implements VoiceTTSClient {
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<Uint8Array> {
    return;
  }
}
