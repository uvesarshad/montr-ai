/**
 * TTS adapter barrel + factory.
 */

export { ElevenLabsTTSClient } from './elevenlabs';
export { OpenAITTSClient } from './openai';
export { SarvamTTSClient } from './sarvam';
export { TwilioPollyTTSClient } from './twilio-polly';

import { ElevenLabsTTSClient } from './elevenlabs';
import { OpenAITTSClient } from './openai';
import { SarvamTTSClient } from './sarvam';
import { TwilioPollyTTSClient } from './twilio-polly';
import type { VoiceTTSClient } from '../tts';

export type TTSProviderId = 'elevenlabs' | 'openai' | 'sarvam' | 'twilio-polly';

export interface TTSFactoryOptions {
  provider?: TTSProviderId;
  language?: string;
  apiKey?: string;
  voice?: string;
}

/**
 * Construct a TTS client. Defaults:
 *   - sarvam for Indic
 *   - openai for cheap volume
 *   - elevenlabs for premium (requires explicit selection)
 */
export function createTTSClient(options: TTSFactoryOptions = {}): VoiceTTSClient {
  const lang = (options.language ?? 'en-US').toLowerCase();
  const isIndic = /^(hi|ta|te|kn|ml|mr|gu|bn|pa|or|as)(-|$)/.test(lang);
  const provider: TTSProviderId = options.provider
    ?? (isIndic ? 'sarvam' : 'openai');

  switch (provider) {
    case 'elevenlabs':
      return new ElevenLabsTTSClient({ apiKey: options.apiKey, voiceId: options.voice });
    case 'openai':
      return new OpenAITTSClient({ apiKey: options.apiKey, voice: options.voice });
    case 'sarvam':
      return new SarvamTTSClient({ apiKey: options.apiKey, speaker: options.voice, language: options.language });
    case 'twilio-polly':
      return new TwilioPollyTTSClient();
  }
}
