/**
 * Deepgram STT adapter — live streaming via WebSocket.
 *
 * Deepgram's `wss://api.deepgram.com/v1/listen` accepts raw audio frames and
 * returns interim + final transcript JSON. μ-law 8 kHz is native (no
 * resampling for telephony audio).
 *
 * Auth: `Authorization: Token <apiKey>` header at handshake.
 * API key resolution: env `DEEPGRAM_API_KEY` or passed in via constructor.
 *
 * Use: `new DeepgramSTTClient({ apiKey })` then `client.start({onSegment, ...})`.
 */

import WebSocket from 'ws';

import type { STTSegmentEvent, STTSession, VoiceSTTClient } from '../stt';

interface DeepgramOptions {
  apiKey?: string;
  model?: string;
  endpointing?: number;
  smartFormat?: boolean;
}

interface DeepgramAlternative {
  transcript?: string;
  confidence?: number;
}

interface DeepgramChannel {
  alternatives?: DeepgramAlternative[];
}

interface DeepgramTranscriptMessage {
  type?: string;
  channel?: DeepgramChannel;
  is_final?: boolean;
  start?: number;
  duration?: number;
}

function buildUrl(opts: {
  language?: string;
  sampleRate?: number;
  encoding?: 'mulaw' | 'pcm16';
  model?: string;
  endpointing?: number;
  smartFormat?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set('model', opts.model ?? 'nova-3-general');
  params.set('encoding', opts.encoding === 'pcm16' ? 'linear16' : 'mulaw');
  params.set('sample_rate', String(opts.sampleRate ?? 8000));
  params.set('language', opts.language ?? 'en-US');
  params.set('interim_results', 'true');
  params.set('punctuate', 'true');
  params.set('endpointing', String(opts.endpointing ?? 300));
  if (opts.smartFormat) params.set('smart_format', 'true');
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export class DeepgramSTTClient implements VoiceSTTClient {
  private readonly apiKey: string;
  private readonly options: DeepgramOptions;

  constructor(options: DeepgramOptions = {}) {
    const apiKey = options.apiKey ?? process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY missing — configure env or pass apiKey');
    }
    this.apiKey = apiKey;
    this.options = options;
  }

  async start(options: Parameters<VoiceSTTClient['start']>[0]): Promise<STTSession> {
    const url = buildUrl({
      language: options.language,
      sampleRate: options.sampleRate,
      encoding: options.encoding,
      model: this.options.model,
      endpointing: this.options.endpointing,
      smartFormat: this.options.smartFormat,
    });

    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${this.apiKey}` },
    });

    let opened = false;
    const buffer: Uint8Array[] = [];

    ws.on('open', () => {
      opened = true;
      for (const chunk of buffer) ws.send(chunk);
      buffer.length = 0;
    });

    ws.on('message', (raw: Buffer) => {
      let msg: DeepgramTranscriptMessage;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }
      if (msg.type !== 'Results') return;
      const alt = msg.channel?.alternatives?.[0];
      const text = alt?.transcript?.trim();
      if (!text) return;
      const segment: STTSegmentEvent = {
        text,
        startSec: msg.start ?? 0,
        endSec: (msg.start ?? 0) + (msg.duration ?? 0),
        speaker: 'caller',
        confidence: alt?.confidence,
        isFinal: msg.is_final === true,
      };
      void options.onSegment(segment);
    });

    ws.on('error', (err: Error) => {
      options.onError?.(err);
    });

    return {
      writeAudio(chunk: Uint8Array) {
        if (!opened) {
          buffer.push(chunk);
          return;
        }
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk);
        }
      },
      async close() {
        if (ws.readyState === ws.OPEN) {
          // Deepgram closes the stream when it receives an empty binary frame.
          ws.send(Buffer.alloc(0));
          ws.close();
        }
      },
    };
  }
}
