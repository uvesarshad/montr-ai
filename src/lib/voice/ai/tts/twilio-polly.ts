/**
 * Twilio Polly TTS adapter.
 *
 * Twilio doesn't expose Polly as a streaming audio API outside TwiML's
 * `<Say voice="Polly.*">` element. For Media Stream consumers we have two
 * options:
 *   (a) Synthesize via AWS Polly directly (requires AWS creds + polly SDK).
 *   (b) Use as a TwiML-only fallback — the bridge falls back to a `<Say>`
 *       TwiML response when this client is selected.
 *
 * This adapter is the (b) variant — it emits no audio chunks. The bridge
 * detects an empty stream and emits a `<Play>`/`<Say>` TwiML instead.
 * Acceptable for system messages, status announcements, etc.
 *
 * For true Polly streaming, swap in `@aws-sdk/client-polly` here.
 */

import type { TTSStreamOptions, VoiceTTSClient } from '../tts';

export class TwilioPollyTTSClient implements VoiceTTSClient {
  // eslint-disable-next-line require-yield
  async *stream(_text: string, _opts?: TTSStreamOptions): AsyncIterable<Uint8Array> {
    // Intentional no-op stream. The caller treats this as "fall back to
    // server-side TwiML <Say>" — not an error condition. See
    // TWILIO_MEDIA_STREAM_WIRING.md for the rationale.
    return;
  }
}
