/**
 * Voice model barrel.
 *
 * Re-exports model defaults + interfaces for ergonomic imports elsewhere.
 */

export { default as VoiceProviderConfig } from './voice-provider-config.model';
export type {
  IVoiceProviderConfig,
  VoiceProviderConfigScope,
} from './voice-provider-config.model';

export { default as VoicePhoneNumber } from './voice-phone-number.model';
export type {
  IVoicePhoneNumber,
  IVoiceInboundRouting,
  VoiceInboundRoutingType,
  VoiceNumberCapability,
} from './voice-phone-number.model';

export { default as CallSession } from './call-session.model';
export type {
  ICallSession,
  ICallDisposition,
  VoiceCallEndReason,
} from './call-session.model';

export { default as CallTranscript } from './call-transcript.model';
export type {
  ICallTranscript,
  ICallTranscriptSegment,
  CallTranscriptSpeaker,
} from './call-transcript.model';

export { default as VoiceBulkBatch } from './voice-bulk-batch.model';
export type {
  IVoiceBulkBatch,
  IVoiceBulkCallEntry,
  BulkCallEntryStatus,
  BulkBatchStatus,
} from './voice-bulk-batch.model';
