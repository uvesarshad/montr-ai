/**
 * Twilio hosted transcription — batch-only.
 *
 * Twilio Voice Intelligence transcribes a completed recording after the call
 * ends. It CANNOT power live AI conversations — the bridge expects streaming
 * segments while the caller speaks. Use this adapter only for post-call
 * transcript generation (i.e. when the AI bot path is not in use).
 *
 * The implementation discards incoming audio chunks (the bridge collects
 * them, but Twilio already has the audio server-side) and produces a single
 * segment on close by polling the Intelligence service.
 *
 * This is a stub-shaped adapter — `close()` is a no-op because the actual
 * transcript arrives via the existing `recording.available` →
 * `transcript.available` webhook flow handled elsewhere.
 */

import type { STTSession, VoiceSTTClient } from '../stt';

export class TwilioHostedSTTClient implements VoiceSTTClient {
  async start(options: Parameters<VoiceSTTClient['start']>[0]): Promise<STTSession> {
    // Live segments would require Twilio Media Streams + the Real-Time
    // Transcription API, which has restricted availability. We don't expose
    // that here. Treat this adapter as "transcript comes later via webhook".
    return {
      writeAudio() {
        // No-op — Twilio already has the audio server-side.
      },
      async close() {
        // No-op — final transcript arrives via the recording/transcription
        // webhook handled in src/app/api/v2/voice/webhooks/[provider]/[...path]/route.ts.
        void options;
      },
    };
  }
}
