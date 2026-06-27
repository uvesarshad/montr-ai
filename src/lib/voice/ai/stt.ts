/**
 * Speech-to-text adapter interface.
 *
 * A `VoiceSTTClient` consumes raw audio frames (μ-law/PCM as bytes) and emits
 * incremental transcript segments. Implementations wrap providers like
 * Deepgram, Whisper, Sarvam-STT, or Twilio's hosted transcription.
 *
 * Routing of STT goes through B2's `src/ai/client.ts` once the provider chain
 * supports audio. Until then, this interface defines the shape so Phase 5's
 * conversation engine can be wired and unit-tested with a mock STT client.
 */

import type { CallTranscriptSpeaker } from '@/lib/db/models/voice/call-transcript.model';

export interface STTSegmentEvent {
  text: string;
  startSec: number;
  endSec: number;
  speaker: CallTranscriptSpeaker;
  confidence?: number;
  /** True when this is a final transcript for the segment (vs an interim). */
  isFinal: boolean;
}

export interface VoiceSTTClient {
  /** Establish a streaming session. Returns a controller to write audio. */
  start(options: {
    language?: string;
    sampleRate?: number;
    encoding?: 'mulaw' | 'pcm16';
    onSegment: (event: STTSegmentEvent) => void | Promise<void>;
    onError?: (error: Error) => void;
  }): Promise<STTSession>;
}

export interface STTSession {
  /** Push raw audio bytes for transcription. */
  writeAudio(chunk: Uint8Array): void;
  /** Signal end-of-stream and flush remaining audio. */
  close(): Promise<void>;
}

/**
 * Stub implementation used in tests / before STT credentials are configured.
 * The conversation engine handles "no segments" gracefully (it just won't
 * think any speech happened).
 */
export class StubSTTClient implements VoiceSTTClient {
  async start(options: Parameters<VoiceSTTClient['start']>[0]): Promise<STTSession> {
    return {
      writeAudio: () => {
        // intentionally no-op
      },
      close: async () => {
        // Optional: emit a final empty segment so the engine knows we cleanly
        // ended — useful for observability but not strictly required.
        await options.onSegment?.({
          text: '',
          startSec: 0,
          endSec: 0,
          speaker: 'unknown',
          isFinal: true,
        });
      },
    };
  }
}
