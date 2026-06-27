/**
 * Voice subsystem — shared types
 *
 * Defines the provider-agnostic shapes used everywhere voice code crosses a
 * boundary (interface methods, normalized events, registry selection).
 *
 * Providers normalize their own payloads INTO these shapes; MontrAI business
 * logic, workflow triggers, and UI components only ever see these shapes —
 * never Twilio-flavored or Plivo-flavored data.
 */

/** Canonical names of voice providers MontrAI knows about. */
export type VoiceProviderId =
  | 'twilio'
  | 'plivo'
  | 'telnyx'
  | 'cloudonix'
  | 'asterisk-ari'
  | 'in-house';

/**
 * How a provider bridges live call audio to the conversation engine.
 *  - `media_stream`: provider opens a WebSocket carrying raw audio frames
 *    (Twilio Media Streams, Plivo Audio Streams, Telnyx media streaming).
 *  - `call_control`: provider exposes a REST call-control API and the media
 *    bridge is established out-of-band (Telnyx Call Control, Asterisk ARI).
 * The dispatch/worker layer uses this to decide how to attach the bridge.
 */
export type TelephonyTransportKind = 'media_stream' | 'call_control';

/** Which conversation engine drives a call. */
export type VoiceEngineMode = 'cascaded' | 'realtime';

/** Turn-detection strategy for a call (Phase 3). */
export interface VoiceTurnDetectionConfig {
  /**
   * - `energy`: legacy RMS energy detector (default fallback).
   * - `vad`: Silero VAD speech start/stop.
   * - `semantic`: VAD + semantic end-of-utterance model (best).
   */
  mode: 'energy' | 'vad' | 'semantic';
  /** Minimum trailing silence before the user's turn is considered done (ms). */
  minSilenceMs?: number;
  /** Maximum silence cap for dynamic endpointing (ms). */
  maxSilenceMs?: number;
  /** Minimum speech duration to count as a real interruption (ms). */
  interruptMinMs?: number;
  /** Minimum word count to count as a real interruption. */
  interruptMinWords?: number;
  /** Window after a suspected false interruption to resume agent speech (ms). */
  falseInterruptionTimeoutMs?: number;
}

/** Call direction relative to MontrAI. */
export type VoiceCallDirection = 'inbound' | 'outbound';

/** Lifecycle status of a call session. */
export type VoiceCallStatus =
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'no-answer'
  | 'failed'
  | 'cancelled';

/** Provider capabilities exposed for runtime checks. */
export interface VoiceProviderCapabilities {
  supportsRecording: boolean;
  supportsTranscription: boolean;
  supportsSIP: boolean;
  supportsMediaStreams: boolean;
  supportsInboundProvisioning: boolean;
  /** Provider can send/receive SMS on the same number/credential as voice. */
  supportsSms: boolean;
  /** Provider can transfer a live call to a human/agent (warm or cold). */
  supportsTransfers: boolean;
  /** Provider exposes a per-call cost lookup API (vs estimated billing). */
  supportsCostLookup: boolean;
  /** How live audio is bridged into the conversation engine. */
  transportKind: TelephonyTransportKind;
  /** USD per minute, indicative only — not billing source of truth. */
  pricePerMinuteUsd: number;
}

/** Warm/cold transfer of a live call to another number or SIP endpoint. */
export interface VoiceTransferRequest {
  providerCallId: string;
  /** E.164 number or SIP URI of the human/agent to transfer to. */
  to: string;
  /** Caller ID to present on the transfer leg. */
  callerId?: string;
  /**
   * - `cold`: hang up the agent and connect caller↔target directly.
   * - `warm`: bridge into a conference, optionally whisper context first.
   */
  mode?: 'warm' | 'cold';
  /** For warm transfers: URL of audio/whisper played to the target before bridge. */
  whisperUrl?: string;
}

/** Result of a transfer request. */
export interface VoiceTransferResult {
  status: 'initiated' | 'bridged' | 'failed';
  /** Provider id of the new transfer leg, if one was created. */
  transferCallId?: string;
  reason?: string;
}

/** Per-call cost as reported by the provider's billing API. */
export interface VoiceCallCostSnapshot {
  providerCallId: string;
  amount: number;
  currency: string;
  /** Whether the figure came from the provider API or was estimated locally. */
  source: 'provider_api' | 'estimated';
}

/** Outbound call request from MontrAI to provider. */
export interface VoiceOutboundCallRequest {
  from: string;                  // E.164 caller ID owned/allowed by org
  to: string;                    // E.164 destination
  callSessionId: string;         // MontrAI's call_session._id (correlation)
  webhookBaseUrl: string;        // Base URL the provider should POST events to
  options?: {
    machineDetection?: boolean;
    recordCall?: boolean;
    timeoutSec?: number;
    statusCallbackEvents?: string[];
    customHeaders?: Record<string, string>;
  };
}

/** Outbound SMS request from MontrAI to provider (H16). */
export interface VoiceSmsRequest {
  from: string;                  // E.164 sender number owned/allowed by org
  to: string;                    // E.164 destination
  body: string;                  // Message text
  /** Optional URL the provider should POST delivery-status callbacks to. */
  statusCallbackUrl?: string;
}

/** Result of sending an SMS. */
export interface VoiceSmsResult {
  providerMessageId: string;     // Twilio MessageSid (or equivalent)
  status: string;                // Provider's message status (queued/sent/...)
  from: string;
  to: string;
}

/** Result of initiating an outbound call. */
export interface VoiceOutboundCallResult {
  providerCallId: string;
  status: VoiceCallStatus;
  startedAt: Date;
}

/** Result returned by provider when querying live status. */
export interface VoiceCallStatusSnapshot {
  providerCallId: string;
  status: VoiceCallStatus;
  durationSec?: number;
  recordingUrl?: string | null;
  endedAt?: Date | null;
  endReason?: string | null;
}

/** Discriminated union of normalized events emitted by every provider. */
export type VoiceEvent =
  | { type: 'call.initiated'; providerCallId: string; at: Date }
  | { type: 'call.ringing'; providerCallId: string; at: Date }
  | { type: 'call.answered'; providerCallId: string; at: Date }
  | {
      type: 'call.completed';
      providerCallId: string;
      at: Date;
      durationSec: number;
      endReason?: string;
    }
  | {
      type: 'call.failed';
      providerCallId: string;
      at: Date;
      errorCode?: string;
      errorMessage?: string;
    }
  | {
      type: 'recording.available';
      providerCallId: string;
      at: Date;
      recordingUrl: string;
      durationSec?: number;
      mimeType?: string;
    }
  | {
      type: 'transcript.available';
      providerCallId: string;
      at: Date;
      transcriptText: string;
      language?: string;
    }
  | {
      type: 'transcript.segment';
      providerCallId: string;
      at: Date;
      speaker: 'caller' | 'callee' | 'agent' | 'ai_bot' | 'unknown';
      text: string;
      startSec: number;
      endSec: number;
      isFinal: boolean;
    }
  | {
      type: 'dtmf.received';
      providerCallId: string;
      at: Date;
      digits: string;
    }
  | {
      type: 'amd.result';
      providerCallId: string;
      at: Date;
      result: 'human' | 'machine' | 'fax' | 'unknown';
      rawAnsweredBy?: string;
    };

export type VoiceEventType = VoiceEvent['type'];

/** Provider selection context used by the registry. */
export interface VoiceProviderSelectionContext {
  userId: string;
  brandId?: string | null;
  /** Optional preferred provider — for example a workflow-node config. */
  preferredProviderId?: VoiceProviderId;
  /** Set to true to bypass BYOK lookup (admin test path). */
  ignoreByok?: boolean;
}

/** Encrypted credential payload as stored on `voice-provider-config`. */
export interface VoiceProviderCredential {
  providerId: VoiceProviderId;
  name: string;
  type: 'api_key' | 'oauth' | 'basic_auth' | 'custom';
  encryptedValue: string;
  iv: string;
  authTag: string;
  salt: string;
  /** Set when the credential is BYOK; identifies the owning user. */
  byokUserId?: string;
  /** Optional per-credential public metadata (account SID, region, etc.). */
  metadata?: Record<string, unknown>;
}

/** Verification result returned by `verifyWebhookSignature`. */
export interface VoiceWebhookVerification {
  valid: boolean;
  /** Provider-specific reason on failure (for debugging only — do not surface to clients). */
  reason?: string;
}

/** Audio playback request issued mid-call. */
export interface VoicePlayAudioRequest {
  providerCallId: string;
  audioUrl: string;
  loop?: number;
}

/** DTMF send request. */
export interface VoiceSendDtmfRequest {
  providerCallId: string;
  digits: string;
}

/** Inbound webhook payload as received from a provider (opaque to MontrAI). */
export interface VoiceInboundWebhookPayload {
  rawBody: string;
  headers: Record<string, string>;
  signature?: string;
  url: string;
}
