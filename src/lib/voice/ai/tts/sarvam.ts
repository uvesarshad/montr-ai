/**
 * Sarvam TTS adapter — Indic-language text-to-speech.
 *
 * Sarvam's batch TTS endpoint returns base64-encoded WAV per chunk. We
 * decode to PCM16 and (optionally) transcode to μ-law for Twilio Media
 * Streams.
 *
 * Auth: `api-subscription-key: <key>` header.
 */

import type { TTSStreamOptions, VoiceTTSClient } from '../tts';

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

interface SarvamTTSOptions {
  apiKey?: string;
  speaker?: string;
  language?: string;
  model?: string;
}

interface SarvamTTSResponse {
  audios?: string[];
}

function pcm16ToMulaw(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(pcm.length / 2);
  for (let i = 0; i < out.length; i++) {
    let sample = (pcm[i * 2] | (pcm[i * 2 + 1] << 8)) << 16 >> 16;
    const sign = sample < 0 ? 0x80 : 0x00;
    if (sign) sample = -sample;
    sample = sample + 0x84;
    if (sample > 0x7fff) sample = 0x7fff;
    let exponent = 7;
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return out;
}

function stripWavHeader(wav: Uint8Array): Uint8Array {
  // Skip the 44-byte WAV header to get raw PCM16.
  return wav.subarray(44);
}

export class SarvamTTSClient implements VoiceTTSClient {
  private readonly apiKey: string;
  private readonly defaultSpeaker: string;
  private readonly defaultLanguage: string;
  private readonly model: string;

  constructor(options: SarvamTTSOptions = {}) {
    const apiKey = options.apiKey ?? process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error('SARVAM_API_KEY missing for SarvamTTSClient');
    }
    this.apiKey = apiKey;
    this.defaultSpeaker = options.speaker ?? 'meera';
    this.defaultLanguage = options.language ?? 'hi-IN';
    this.model = options.model ?? 'bulbul:v1';
  }

  async *stream(text: string, opts?: TTSStreamOptions): AsyncIterable<Uint8Array> {
    const res = await fetch(SARVAM_TTS_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: this.defaultLanguage,
        speaker: this.defaultSpeaker,
        model: this.model,
        enable_preprocessing: true,
      }),
      signal: opts?.abortSignal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Sarvam TTS ${res.status}: ${errBody}`);
    }

    const json = (await res.json()) as SarvamTTSResponse;
    const wantsMulaw = opts?.encoding === 'mulaw';

    for (const b64 of json.audios ?? []) {
      if (opts?.abortSignal?.aborted) break;
      const wav = Uint8Array.from(Buffer.from(b64, 'base64'));
      const pcm = stripWavHeader(wav);
      yield wantsMulaw ? pcm16ToMulaw(pcm) : pcm;
    }
  }
}
