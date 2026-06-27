/**
 * OpenAI TTS adapter — `audio.speech.create` with streaming.
 *
 * Returns PCM/μ-law-equivalent by routing through the response stream.
 * OpenAI's `wav` format is PCM16; for Twilio Media Streams we transcode to
 * μ-law in the bridge if needed. For lower-cost calls this is the workhorse.
 */

import OpenAI from 'openai';

import type { TTSStreamOptions, VoiceTTSClient } from '../tts';

interface OpenAITTSOptions {
  apiKey?: string;
  voice?: string;
  model?: string;
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

export class OpenAITTSClient implements VoiceTTSClient {
  private readonly client: OpenAI;
  private readonly defaultVoice: string;
  private readonly model: string;

  constructor(options: OpenAITTSOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY missing for OpenAITTSClient');
    }
    this.client = new OpenAI({ apiKey });
    this.defaultVoice = options.voice ?? 'alloy';
    this.model = options.model ?? 'tts-1';
  }

  async *stream(text: string, opts?: TTSStreamOptions): AsyncIterable<Uint8Array> {
    // Use `format: 'pcm'` so we can transcode to μ-law deterministically.
    // OpenAI returns 24 kHz PCM16. For telephony (8 kHz μ-law) we downsample
    // first by simple decimation (3:1) — adequate quality for voice; if
    // higher fidelity is needed swap in a proper resampler.
    const wantsMulaw = opts?.encoding === 'mulaw';
    const targetRate = opts?.sampleRate ?? (wantsMulaw ? 8000 : 24000);

    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: (opts?.voice ?? this.defaultVoice) as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: text,
      response_format: 'pcm',
    });

    const reader = response.body?.getReader();
    if (!reader) return;

    while (true) {
      if (opts?.abortSignal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      if (!wantsMulaw) {
        yield value;
        continue;
      }

      // Decimate 24 kHz → target_rate, then μ-law encode.
      const decimateBy = Math.max(1, Math.round(24000 / targetRate));
      const decimated = new Uint8Array(Math.floor(value.length / decimateBy / 2) * 2);
      for (let i = 0, j = 0; j < decimated.length; i += decimateBy * 2, j += 2) {
        decimated[j] = value[i];
        decimated[j + 1] = value[i + 1];
      }
      yield pcm16ToMulaw(decimated);
    }
  }
}
