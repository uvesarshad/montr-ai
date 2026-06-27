/**
 * Voice provider interface.
 *
 * Every telephony backend (Twilio, Plivo, Telnyx, future in-house IVR) implements
 * this interface. MontrAI code (workflow nodes, dialer API, AI bot pipeline)
 * holds only a `VoiceProvider` reference — never a Twilio/Plivo client directly.
 *
 * Implementations live in `src/lib/voice/providers/*.ts` and register themselves
 * with the registry at module load.
 */

import type {
  VoiceCallCostSnapshot,
  VoiceCallStatusSnapshot,
  VoiceEvent,
  VoiceInboundWebhookPayload,
  VoiceOutboundCallRequest,
  VoiceOutboundCallResult,
  VoicePlayAudioRequest,
  VoiceProviderCapabilities,
  VoiceProviderCredential,
  VoiceProviderId,
  VoiceSendDtmfRequest,
  VoiceSmsRequest,
  VoiceSmsResult,
  VoiceTransferRequest,
  VoiceTransferResult,
  VoiceWebhookVerification,
} from './types';

export interface VoiceProvider {
  /** Provider identifier — matches the discriminator on `VoiceProviderId`. */
  readonly id: VoiceProviderId;

  /** Static capability flags consumed by the registry and UI. */
  readonly capabilities: VoiceProviderCapabilities;

  /**
   * Place an outbound call. Returns the provider's call identifier once the
   * provider has accepted the request — the call is not yet answered.
   */
  initiateOutboundCall(
    request: VoiceOutboundCallRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceOutboundCallResult>;

  /**
   * Send an SMS message (H16). Optional — only providers whose
   * `capabilities.supportsSms` is true implement this. Reuses the same
   * credential/number as voice on the same account.
   */
  sendSms?(
    request: VoiceSmsRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceSmsResult>;

  /** Terminate an in-progress call. */
  hangup(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<void>;

  /** Send DTMF digits to an in-progress call. */
  sendDTMF(
    request: VoiceSendDtmfRequest,
    credential: VoiceProviderCredential,
  ): Promise<void>;

  /**
   * Transfer a live call to a human/agent. Optional — only providers whose
   * `capabilities.supportsTransfers` is true implement this.
   */
  transferCall?(
    request: VoiceTransferRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceTransferResult>;

  /**
   * Fetch the provider-billed cost for a finished call. Optional — only
   * providers whose `capabilities.supportsCostLookup` is true implement this.
   */
  getCallCost?(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallCostSnapshot>;

  /** Play an audio file into an in-progress call. */
  playAudio(
    request: VoicePlayAudioRequest,
    credential: VoiceProviderCredential,
  ): Promise<void>;

  /** Start recording an in-progress call. */
  startRecording(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<{ recordingSid: string }>;

  /** Stop a recording that was previously started. */
  stopRecording(
    providerCallId: string,
    recordingSid: string,
    credential: VoiceProviderCredential,
  ): Promise<void>;

  /** Fetch the latest status snapshot for a call from the provider. */
  getCallStatus(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallStatusSnapshot>;

  /**
   * Verify a webhook signature against the provider's signing secret.
   * Implementations MUST NOT throw — they return a structured result.
   */
  verifyWebhookSignature(
    payload: VoiceInboundWebhookPayload,
    credential: VoiceProviderCredential,
  ): VoiceWebhookVerification;

  /**
   * Convert a provider-specific webhook payload into one or more normalized
   * `VoiceEvent` records. Returns empty array if the payload is recognized but
   * carries no user-visible event (provider heartbeat, status duplicate).
   *
   * Implementations should validate signatures BEFORE calling this, via
   * `verifyWebhookSignature`. Most providers POST x-www-form-urlencoded — the
   * caller is responsible for parsing the rawBody.
   */
  handleInboundWebhook(
    payload: VoiceInboundWebhookPayload,
  ): Promise<VoiceEvent[]>;
}
