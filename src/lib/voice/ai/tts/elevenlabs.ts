/**
 * ElevenLabs TTS adapter — streaming μ-law audio for Twilio Media Streams.
 *
 * The Streaming endpoint returns chunks in the requested output format.
 * For Twilio Media Streams we ask for `ulaw_8000` so chunks slot straight
 * into the bridge without resampling.
 *
 * Auth: `xi-api-key: <apiKey>` header.
 */

import type { TTSStreamOptions, VoiceTTSClient } from '../tts';

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

interface ElevenLabsOptions {
  apiKey?: string;
  /** Default voice id. Overridable per `stream()` call via options.voice. */
  voiceId?: string;
  /** 'eleven_turbo_v2_5' (default) | 'eleven_multilingual_v2' | etc. */
  model?: string;
}

function outputFormatFor(opts?: TTSStreamOptions): string {
  if (opts?.encoding === 'mulaw' && (opts?.sampleRate ?? 8000) === 8000) {
    return 'ulaw_8000';
  }
  // PCM16 fallback — most flexible for non-telephony consumers.
  const rate = opts?.sampleRate ?? 16000;
  return `pcm_${rate}`;
}

export class ElevenLabsTTSClient implements VoiceTTSClient {
  private readonly apiKey: string;
  private readonly defaultVoiceId: string;
  private readonly model: string;

  constructor(options: ElevenLabsOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY missing for ElevenLabsTTSClient');
    }
    this.apiKey = apiKey;
    // Sensible "Rachel" default; admin UI/character config overrides.
    this.defaultVoiceId = options.voiceId ?? '21m00Tcm4TlvDq8ikWAM';
    this.model = options.model ?? 'eleven_turbo_v2_5';
  }

  async *stream(text: string, opts?: TTSStreamOptions): AsyncIterable<Uint8Array> {
    const voiceId = opts?.voice ?? this.defaultVoiceId;
    const url = `${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${outputFormatFor(opts)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: this.model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: opts?.abortSignal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`ElevenLabs TTS failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    while (true) {
      if (opts?.abortSignal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) yield value;
    }
  }
}
