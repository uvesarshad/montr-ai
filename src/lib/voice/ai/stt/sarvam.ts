/**
 * Sarvam STT adapter — Indic-language speech-to-text.
 *
 * Sarvam exposes both streaming (`/speech-to-text-streaming`) and batch
 * (`/speech-to-text`) endpoints. We use batch with a periodic flush, like
 * the Whisper adapter, because Sarvam's streaming API is region-restricted
 * and the batch endpoint is feature-complete for our μ-law telephony audio.
 *
 * Auth: `api-subscription-key: <key>` header.
 * API key resolution: env `SARVAM_API_KEY` or constructor option.
 */

import type { STTSession, VoiceSTTClient } from '../stt';

const BATCH_DURATION_MS = 4000;
const SARVAM_BATCH_URL = 'https://api.sarvam.ai/speech-to-text';

interface SarvamOptions {
  apiKey?: string;
  /** ISO-639 code: 'hi-IN', 'ta-IN', 'te-IN', 'mr-IN', 'gu-IN', etc. */
  language?: string;
  /** 'saarika:v2' (default) or 'saarika:v1'. */
  model?: string;
}

interface SarvamResponse {
  transcript?: string;
  language_code?: string;
}

function mulawToWav(mulaw: Uint8Array, sampleRate: number): Uint8Array {
  const pcm = new Int16Array(mulaw.length);
  const decode = (b: number): number => {
    const mu = ~b & 0xff;
    const sign = mu & 0x80;
    const exp = (mu >> 4) & 0x07;
    const mant = mu & 0x0f;
    let s = ((mant << 3) + 0x84) << exp;
    s -= 0x84;
    return sign ? -s : s;
  };
  for (let i = 0; i < mulaw.length; i++) pcm[i] = decode(mulaw[i]);

  const dataLen = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export class SarvamSTTClient implements VoiceSTTClient {
  private readonly apiKey: string;
  private readonly defaultLanguage: string;
  private readonly model: string;

  constructor(options: SarvamOptions = {}) {
    const apiKey = options.apiKey ?? process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error('SARVAM_API_KEY missing for SarvamSTTClient');
    }
    this.apiKey = apiKey;
    this.defaultLanguage = options.language ?? 'hi-IN';
    this.model = options.model ?? 'saarika:v2';
  }

  async start(options: Parameters<VoiceSTTClient['start']>[0]): Promise<STTSession> {
    const encoding = options.encoding ?? 'mulaw';
    const sampleRate = options.sampleRate ?? 8000;
    const bytesPerSecond = encoding === 'mulaw' ? sampleRate : sampleRate * 2;
    const batchSize = Math.floor((bytesPerSecond * BATCH_DURATION_MS) / 1000);

    let buffer: number[] = [];
    let startSec = 0;
    let closed = false;

    const apiKey = this.apiKey;
    const defaultLanguage = this.defaultLanguage;
    const model = this.model;

    const flush = async () => {
      if (buffer.length === 0) return;
      const bytes = new Uint8Array(buffer);
      buffer = [];
      const wav = encoding === 'mulaw' ? mulawToWav(bytes, sampleRate) : bytes;

      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
      form.append('language_code', options.language ?? defaultLanguage);
      form.append('model', model);

      try {
        const res = await fetch(SARVAM_BATCH_URL, {
          method: 'POST',
          headers: { 'api-subscription-key': apiKey },
          body: form,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          options.onError?.(new Error(`Sarvam STT ${res.status}: ${errBody}`));
          return;
        }
        const json = (await res.json()) as SarvamResponse;
        const text = json.transcript?.trim();
        const durationSec = bytes.length / bytesPerSecond;
        if (text) {
          await options.onSegment({
            text,
            startSec,
            endSec: startSec + durationSec,
            speaker: 'caller',
            isFinal: true,
          });
        }
        startSec += durationSec;
      } catch (err) {
        options.onError?.(err as Error);
      }
    };

    return {
      writeAudio(chunk: Uint8Array) {
        if (closed) return;
        for (const b of chunk) buffer.push(b);
        if (buffer.length >= batchSize) void flush();
      },
      async close() {
        closed = true;
        await flush();
      },
    };
  }
}
