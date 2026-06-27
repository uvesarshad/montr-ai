/**
 * Voice subsystem barrel.
 *
 * Importing this module triggers provider registration as a side effect (each
 * provider's file calls `registerVoiceProvider` at load time). Application
 * entrypoints should import `@/lib/voice` once at startup to ensure every
 * provider is available to the registry.
 */

// Re-exports for consumers.
export type {
  VoiceProvider,
} from './provider';

export type {
  VoiceCallCostSnapshot,
  VoiceCallDirection,
  VoiceCallStatus,
  VoiceCallStatusSnapshot,
  VoiceEngineMode,
  VoiceEvent,
  VoiceEventType,
  VoiceInboundWebhookPayload,
  VoiceOutboundCallRequest,
  VoiceOutboundCallResult,
  VoicePlayAudioRequest,
  VoiceProviderCapabilities,
  VoiceProviderCredential,
  VoiceProviderId,
  VoiceProviderSelectionContext,
  VoiceSendDtmfRequest,
  VoiceTransferRequest,
  VoiceTransferResult,
  VoiceTurnDetectionConfig,
  TelephonyTransportKind,
  VoiceWebhookVerification,
} from './types';

export {
  getVoiceProvider,
  listVoiceProviders,
  registerVoiceProvider,
} from './registry';

export {
  getProviderForCall,
  setVoiceProviderConfigLookup,
} from './selection';

export type {
  VoiceProviderConfigLookup,
  VoiceProviderSelection,
} from './selection';

// Side-effect imports register provider implementations.
import './providers/twilio';
import './providers/telnyx';
import './providers/plivo';
import './providers/cloudonix';
import './providers/asterisk-ari';
