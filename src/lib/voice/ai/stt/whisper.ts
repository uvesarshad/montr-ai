/**
 * OpenAI Whisper STT adapter — uses the streaming `audio.transcriptions.create`
 * endpoint with `gpt-4o-transcribe` (Whisper-class, streaming).
 *
 * Latency caveat: Whisper's first-token latency is higher than Deepgram's.
 * Use this when transcription accuracy matters more than turn-around time
 * (long recordings, multilingual, accented English).
 *
 * Strategy here: buffer incoming μ-law frames, accumulate ~3s of audio per
 * batch, run transcription on each batch. Not as low-latency as Deepgram's
 * native streaming but works without a custom WS protocol.
 */

import OpenAI from 'openai';

import type { STTSession, VoiceSTTClient } from '../stt';

const BATCH_DURATION_MS = 3000;

interface WhisperOptions {
  apiKey?: string;
  model?: string; // 'gpt-4o-transcribe' | 'whisper-1'
}

function mulawToWav(mulaw: Uint8Array, sampleRate: number): Uint8Array {
  // Convert μ-law → PCM16 → WAV container so the OpenAI API can decode it.
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
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export class WhisperSTTClient implements VoiceSTTClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: WhisperOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY missing for WhisperSTTClient');
    }
    this.client = new OpenAI({ apiKey });
    this.model = options.model ?? 'gpt-4o-transcribe';
  }

  async start(options: Parameters<VoiceSTTClient['start']>[0]): Promise<STTSession> {
    const encoding = options.encoding ?? 'mulaw';
    const sampleRate = options.sampleRate ?? 8000;
    const bytesPerSecond = encoding === 'mulaw' ? sampleRate : sampleRate * 2;
    const batchSize = Math.floor((bytesPerSecond * BATCH_DURATION_MS) / 1000);

    let buffer: number[] = [];
    let startSec = 0;
    let closed = false;

    const flush = async () => {
      if (buffer.length === 0) return;
      const bytes = new Uint8Array(buffer);
      buffer = [];
      const wav = encoding === 'mulaw' ? mulawToWav(bytes, sampleRate) : bytes;
      try {
        const wavArrayBuffer = wav.buffer.slice(
          wav.byteOffset,
          wav.byteOffset + wav.byteLength,
        ) as ArrayBuffer;
        const file = new File([wavArrayBuffer], `chunk-${Date.now()}.wav`, {
          type: 'audio/wav',
        });
        const result = await this.client.audio.transcriptions.create({
          file,
          model: this.model,
          language: options.language?.split('-')[0],
        });
        const text = (result as { text?: string }).text?.trim();
        if (!text) return;
        const durationSec = bytes.length / bytesPerSecond;
        await options.onSegment({
          text,
          startSec,
          endSec: startSec + durationSec,
          speaker: 'caller',
          isFinal: true,
        });
        startSec += durationSec;
      } catch (err) {
        options.onError?.(err as Error);
      }
    };

    return {
      writeAudio(chunk: Uint8Array) {
        if (closed) return;
        for (const b of chunk) buffer.push(b);
        if (buffer.length >= batchSize) {
          void flush();
        }
      },
      async close() {
        closed = true;
        await flush();
      },
    };
  }
}
