/**
 * OpenAI Realtime API client (speech-to-speech) over a raw WebSocket.
 *
 * The Realtime API collapses STT + LLM + TTS into ONE bidirectional audio
 * socket with server-side VAD/turn-detection and native barge-in — far lower
 * latency than the cascaded pipeline. Telephony audio is 8 kHz μ-law, which the
 * Realtime API speaks directly (`g711_ulaw` in/out), so there's NO resampling.
 *
 * This is a deliberate exception to "all AI goes through src/ai/client.ts":
 * that abstraction models request/response *text* generation, not a duplex
 * audio protocol. We still resolve the API key from the same env the cascaded
 * path falls back to, so BYOK/system keys keep working.
 *
 * Docs: https://platform.openai.com/docs/guides/realtime
 */

import WebSocket from 'ws';

export interface RealtimeToolDef {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface OpenAIRealtimeOptions {
  apiKey: string;
  model?: string;
  /** TTS voice id (alloy, echo, shimmer, …). */
  voice?: string;
  /** System prompt / persona. */
  instructions: string;
  tools?: RealtimeToolDef[];
  temperature?: number;
  /** Greet the caller first (send an initial response on connect). */
  greet?: boolean;

  onAudioDelta: (mulawBytes: Uint8Array) => void;
  /** Caller started speaking (server VAD) — barge-in: clear buffered playback. */
  onSpeechStarted: () => void;
  onUserTranscript: (text: string) => void;
  onAgentTranscript: (text: string) => void;
  /** A function/tool call the model wants executed. */
  onToolCall: (call: { name: string; callId: string; args: unknown }) => void;
  onError: (err: Error) => void;
  onClose?: () => void;
}

const DEFAULT_MODEL = process.env.VOICE_REALTIME_MODEL ?? 'gpt-4o-realtime-preview';

/** Resolve the Realtime API key (explicit → dedicated env → OpenAI env). */
export function resolveRealtimeApiKey(explicit?: string): string | null {
  return (
    explicit
    || process.env.VOICE_REALTIME_API_KEY
    || process.env.OPENAI_API_KEY
    || null
  );
}

export class OpenAIRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly opts: OpenAIRealtimeOptions;
  private readonly model: string;
  private responseActive = false;
  private closed = false;

  constructor(opts: OpenAIRealtimeOptions) {
    this.opts = opts;
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  /** Open the socket and configure the session. Resolves once connected. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.model)}`;
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });
      this.ws = ws;

      ws.on('open', () => resolve());
      ws.on('message', (raw: Buffer) => this.handleMessage(raw));
      ws.on('error', (err: Error) => {
        if (!this.closed) this.opts.onError(err);
        reject(err);
      });
      ws.on('close', () => {
        this.closed = true;
        this.opts.onClose?.();
      });
    });
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private configureSession(): void {
    this.send({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: this.opts.instructions,
        voice: this.opts.voice ?? 'alloy',
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: this.opts.tools ?? [],
        tool_choice: (this.opts.tools && this.opts.tools.length > 0) ? 'auto' : 'none',
        temperature: this.opts.temperature ?? 0.8,
      },
    });
  }

  /** Push caller audio (8 kHz μ-law bytes). Server VAD handles turn-taking. */
  appendAudio(mulawBytes: Uint8Array): void {
    if (this.closed) return;
    this.send({
      type: 'input_audio_buffer.append',
      audio: Buffer.from(mulawBytes).toString('base64'),
    });
  }

  /** Cancel the in-progress assistant response (used on barge-in). */
  cancelResponse(): void {
    if (this.responseActive) {
      this.send({ type: 'response.cancel' });
      this.responseActive = false;
    }
  }

  /** Return a tool result to the model and let it continue speaking. */
  sendToolResult(callId: string, output: unknown): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: typeof output === 'string' ? output : JSON.stringify(output),
      },
    });
    this.send({ type: 'response.create' });
  }

  close(): void {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private handleMessage(raw: Buffer): void {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }

    switch (msg.type) {
      case 'session.created':
        this.configureSession();
        if (this.opts.greet) {
          this.responseActive = true;
          this.send({ type: 'response.create' });
        }
        break;
      case 'response.created':
        this.responseActive = true;
        break;
      case 'response.audio.delta': {
        const delta = typeof msg.delta === 'string' ? msg.delta : '';
        if (delta) this.opts.onAudioDelta(new Uint8Array(Buffer.from(delta, 'base64')));
        break;
      }
      case 'input_audio_buffer.speech_started':
        // Caller barged in — stop our current reply + flush buffered playback.
        this.cancelResponse();
        this.opts.onSpeechStarted();
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const t = typeof msg.transcript === 'string' ? msg.transcript : '';
        if (t.trim()) this.opts.onUserTranscript(t.trim());
        break;
      }
      case 'response.audio_transcript.done': {
        const t = typeof msg.transcript === 'string' ? msg.transcript : '';
        if (t.trim()) this.opts.onAgentTranscript(t.trim());
        break;
      }
      case 'response.function_call_arguments.done': {
        const name = typeof msg.name === 'string' ? msg.name : '';
        const callId = typeof msg.call_id === 'string' ? msg.call_id : '';
        let args: unknown = {};
        try {
          args = typeof msg.arguments === 'string' ? JSON.parse(msg.arguments) : msg.arguments;
        } catch {
          args = {};
        }
        if (name && callId) this.opts.onToolCall({ name, callId, args });
        break;
      }
      case 'response.done':
        this.responseActive = false;
        break;
      case 'error': {
        const e = msg.error as { message?: string } | undefined;
        this.opts.onError(new Error(e?.message ?? 'OpenAI Realtime error'));
        break;
      }
    }
  }
}
