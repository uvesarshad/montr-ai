/**
 * STT adapter barrel + factory.
 *
 * Provider selection at call time: caller passes `sttProvider: 'deepgram' |
 * 'whisper' | 'sarvam' | 'twilio-hosted'`. Default routing logic (lang +
 * plan + cost) can live in a follow-up `selectSTT` helper.
 */

export { DeepgramSTTClient } from './deepgram';
export { WhisperSTTClient } from './whisper';
export { SarvamSTTClient } from './sarvam';
export { TwilioHostedSTTClient } from './twilio-hosted';

import { DeepgramSTTClient } from './deepgram';
import { WhisperSTTClient } from './whisper';
import { SarvamSTTClient } from './sarvam';
import { TwilioHostedSTTClient } from './twilio-hosted';
import type { VoiceSTTClient } from '../stt';

export type STTProviderId = 'deepgram' | 'whisper' | 'sarvam' | 'twilio-hosted';

export interface STTFactoryOptions {
  provider?: STTProviderId;
  /** Language hint — used to auto-route Indic to Sarvam if no provider set. */
  language?: string;
  apiKey?: string;
}

/**
 * Construct an STT client. If `provider` is unspecified, picks:
 *   - sarvam for Indic language codes
 *   - deepgram otherwise (cheapest + lowest latency)
 */
export function createSTTClient(options: STTFactoryOptions = {}): VoiceSTTClient {
  const lang = (options.language ?? 'en-US').toLowerCase();
  const isIndic = /^(hi|ta|te|kn|ml|mr|gu|bn|pa|or|as)(-|$)/.test(lang);

  const provider: STTProviderId = options.provider
    ?? (isIndic ? 'sarvam' : 'deepgram');

  switch (provider) {
    case 'deepgram':
      return new DeepgramSTTClient({ apiKey: options.apiKey });
    case 'whisper':
      return new WhisperSTTClient({ apiKey: options.apiKey });
    case 'sarvam':
      return new SarvamSTTClient({ apiKey: options.apiKey, language: options.language });
    case 'twilio-hosted':
      return new TwilioHostedSTTClient();
  }
}
