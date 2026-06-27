/**
 * Voice subsystem bootstrap.
 *
 * Wires the Mongo-backed config lookup into the provider registry. Call once
 * at process startup (HTTP server entrypoint + BullMQ worker).
 *
 * Provider implementations register themselves on import via `@/lib/voice`.
 * The lookup must be set BEFORE the first call to `getProviderForCall`.
 */

import { setVoiceProviderConfigLookup } from './selection';
import { voiceProviderConfigRepository } from '@/lib/db/repository/voice';

// Trigger provider registration as a side effect.
import '@/lib/voice/providers/twilio';
import '@/lib/voice/providers/telnyx';
import '@/lib/voice/providers/plivo';
import '@/lib/voice/providers/cloudonix';
import '@/lib/voice/providers/asterisk-ari';

let initialized = false;

export function initVoiceSubsystem(): void {
  if (initialized) return;
  setVoiceProviderConfigLookup(voiceProviderConfigRepository);
  initialized = true;
}
