/**
 * Telnyx voice provider implementation.
 *
 * Implements `VoiceProvider` against Telnyx's Call Control v2 REST API + webhooks.
 * Notes:
 *  - Telnyx is a `call_control` provider: media bridging is established
 *    out-of-band (via media streaming), while call lifecycle is driven through
 *    REST "command" endpoints on a Call Control App.
 *  - Credentials decode to `{ apiKey: string, connectionId: string, publicKey?: string }`
 *    JSON. `apiKey` is the V2 API key (Bearer auth); `connectionId` is the Call
 *    Control App / Connection used as the outbound leg; `publicKey` is the
 *    base64 Ed25519 webhook signing public key (from the Telnyx portal).
 *  - There is no official Telnyx SDK installed — all outbound HTTP goes through
 *    `safeOutboundFetch` (SSRF hard rule).
 *  - Webhook signature: Ed25519 over `${telnyx-timestamp}|${rawBody}` with the
 *    `telnyx-signature-ed25519` header (base64). Verified with Node `crypto`
 *    when `publicKey` is configured; otherwise returns `{valid:false}` with a
 *    clear reason — never throws.
 *  - Telnyx webhook bodies are JSON (`{ data: { event_type, payload } }`), NOT
 *    form-urlencoded.
 */

import crypto from 'crypto';
import { decryptCredential } from '@/lib/workflow/credential-encryption';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

import type { VoiceProvider } from '../provider';
import { registerVoiceProvider } from '../registry';
import type {
  VoiceCallStatusSnapshot,
  VoiceEvent,
  VoiceInboundWebhookPayload,
  VoiceOutboundCallRequest,
  VoiceOutboundCallResult,
  VoicePlayAudioRequest,
  VoiceProviderCapabilities,
  VoiceProviderCredential,
  VoiceSendDtmfRequest,
  VoiceSmsRequest,
  VoiceSmsResult,
  VoiceTransferRequest,
  VoiceTransferResult,
  VoiceWebhookVerification,
} from '../types';

interface TelnyxCredentialPayload {
  apiKey: string;
  connectionId: string;
  /** Base64 Ed25519 webhook signing public key (optional but recommended). */
  publicKey?: string;
}

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

function decodeTelnyxCredential(
  credential: VoiceProviderCredential,
): TelnyxCredentialPayload {
  if (credential.providerId !== 'telnyx') {
    throw new Error(`Expected telnyx credential, got ${credential.providerId}`);
  }

  const userId = credential.byokUserId
    ?? (typeof credential.metadata?.userId === 'string'
      ? credential.metadata.userId
      : undefined);

  if (!userId) {
    throw new Error('Telnyx credential has no associated userId for decryption');
  }

  const decrypted = decryptCredential(
    {
      name: credential.name,
      type: credential.type,
      encryptedValue: credential.encryptedValue,
      iv: credential.iv,
      authTag: credential.authTag,
      salt: credential.salt,
    },
    userId,
  );

  const value = decrypted.value;
  if (
    !value
    || typeof value !== 'object'
    || typeof (value as TelnyxCredentialPayload).apiKey !== 'string'
    || typeof (value as TelnyxCredentialPayload).connectionId !== 'string'
  ) {
    throw new Error('Telnyx credential did not decrypt to {apiKey, connectionId}');
  }

  return value as TelnyxCredentialPayload;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Issue a Call Control command against a specific call leg.
 * Telnyx call legs are addressed by their `call_control_id`.
 */
async function callControlCommand(
  apiKey: string,
  callControlId: string,
  command: string,
  body: Record<string, unknown>,
) {
  const url = `${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/${command}`;
  return safeOutboundFetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

const TELNYX_CAPABILITIES: VoiceProviderCapabilities = {
  supportsRecording: true,
  supportsTranscription: true,
  supportsSIP: true,
  supportsMediaStreams: true,
  supportsInboundProvisioning: true,
  supportsSms: true,
  supportsTransfers: true,
  supportsCostLookup: false,
  transportKind: 'call_control',
  pricePerMinuteUsd: 0.01,
};

class TelnyxProvider implements VoiceProvider {
  readonly id = 'telnyx' as const;
  readonly capabilities = TELNYX_CAPABILITIES;

  async initiateOutboundCall(
    request: VoiceOutboundCallRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceOutboundCallResult> {
    const { apiKey, connectionId } = decodeTelnyxCredential(credential);

    const webhookUrl = new URL(
      `/api/v2/voice/webhooks/telnyx/${encodeURIComponent(request.callSessionId)}`,
      request.webhookBaseUrl,
    ).toString();

    const response = await safeOutboundFetch(`${TELNYX_API_BASE}/calls`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        connection_id: connectionId,
        to: request.to,
        from: request.from,
        webhook_url: webhookUrl,
        // Telnyx fires status callbacks to the connection's configured webhook
        // and the per-call webhook_url above. We also enable recording/AMD
        // inline when requested.
        timeout_secs: request.options?.timeoutSec,
        answering_machine_detection: request.options?.machineDetection
          ? 'premium'
          : 'disabled',
        record: request.options?.recordCall ? 'record-from-answer' : undefined,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Telnyx outbound call failed: ${response.status} ${text}`);
    }

    const json = (await response.json()) as {
      data?: { call_control_id?: string; call_session_id?: string };
    };
    const callControlId = json.data?.call_control_id;
    if (!callControlId) {
      throw new Error('Telnyx outbound call response missing call_control_id');
    }

    return {
      providerCallId: callControlId,
      status: 'initiated',
      startedAt: new Date(),
    };
  }

  async sendSms(
    request: VoiceSmsRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceSmsResult> {
    const { apiKey } = decodeTelnyxCredential(credential);

    const response = await safeOutboundFetch(`${TELNYX_API_BASE}/messages`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        from: request.from,
        to: request.to,
        text: request.body,
        webhook_url: request.statusCallbackUrl,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Telnyx SMS failed: ${response.status} ${text}`);
    }

    const json = (await response.json()) as {
      data?: { id?: string; to?: Array<{ status?: string }> };
    };

    return {
      providerMessageId: json.data?.id ?? '',
      status: json.data?.to?.[0]?.status ?? 'queued',
      from: request.from,
      to: request.to,
    };
  }

  async hangup(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { apiKey } = decodeTelnyxCredential(credential);
    await callControlCommand(apiKey, providerCallId, 'hangup', {});
  }

  async sendDTMF(
    request: VoiceSendDtmfRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { apiKey } = decodeTelnyxCredential(credential);
    await callControlCommand(apiKey, request.providerCallId, 'send_dtmf', {
      digits: request.digits,
    });
  }

  async playAudio(
    request: VoicePlayAudioRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { apiKey } = decodeTelnyxCredential(credential);
    await callControlCommand(apiKey, request.providerCallId, 'playback_start', {
      audio_url: request.audioUrl,
      loop: request.loop ?? 1,
    });
  }

  async transferCall(
    request: VoiceTransferRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceTransferResult> {
    const { apiKey } = decodeTelnyxCredential(credential);
    // Telnyx `transfer` re-routes the existing leg to a new destination. For a
    // warm transfer, the agent worker is expected to bridge/whisper first; the
    // `transfer` command itself is a cold-style re-route of the caller leg.
    try {
      const response = await callControlCommand(
        apiKey,
        request.providerCallId,
        'transfer',
        {
          to: request.to,
          from: request.callerId,
          audio_url: request.mode === 'warm' ? request.whisperUrl : undefined,
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { status: 'failed', reason: `${response.status} ${text}` };
      }
      return { status: request.mode === 'warm' ? 'bridged' : 'initiated' };
    } catch (err) {
      return {
        status: 'failed',
        reason: err instanceof Error ? err.message : 'transfer failed',
      };
    }
  }

  async startRecording(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<{ recordingSid: string }> {
    const { apiKey } = decodeTelnyxCredential(credential);
    // Telnyx record_start does not return a recording id synchronously — the id
    // arrives later on the `call.recording.saved` webhook. We return the
    // call_control_id as a stable correlation handle so stopRecording can target
    // the same leg.
    await callControlCommand(apiKey, providerCallId, 'record_start', {
      format: 'mp3',
      channels: 'dual',
    });
    return { recordingSid: providerCallId };
  }

  async stopRecording(
    providerCallId: string,
    _recordingSid: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { apiKey } = decodeTelnyxCredential(credential);
    await callControlCommand(apiKey, providerCallId, 'record_stop', {});
  }

  async getCallStatus(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallStatusSnapshot> {
    const { apiKey } = decodeTelnyxCredential(credential);
    const response = await safeOutboundFetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(providerCallId)}`,
      { method: 'GET', headers: authHeaders(apiKey) },
    );

    if (!response.ok) {
      // Telnyx returns 404 once a call leg has ended and aged out — treat as
      // completed rather than throwing in a status poll.
      return {
        providerCallId,
        status: response.status === 404 ? 'completed' : 'failed',
        recordingUrl: null,
        endedAt: null,
        endReason: null,
      };
    }

    const json = (await response.json()) as {
      data?: { call_session_id?: string; is_alive?: boolean };
    };
    const alive = json.data?.is_alive;

    return {
      providerCallId,
      status: alive ? 'in-progress' : 'completed',
      recordingUrl: null,
      endedAt: alive ? null : new Date(),
      endReason: null,
    };
  }

  verifyWebhookSignature(
    payload: VoiceInboundWebhookPayload,
    credential: VoiceProviderCredential,
  ): VoiceWebhookVerification {
    const signature = payload.signature
      ?? payload.headers['telnyx-signature-ed25519']
      ?? payload.headers['Telnyx-Signature-Ed25519'];
    const timestamp = payload.headers['telnyx-timestamp']
      ?? payload.headers['Telnyx-Timestamp'];

    if (!signature) {
      return { valid: false, reason: 'missing telnyx-signature-ed25519 header' };
    }
    if (!timestamp) {
      return { valid: false, reason: 'missing telnyx-timestamp header' };
    }

    let publicKey: string | undefined;
    try {
      publicKey = decodeTelnyxCredential(credential).publicKey;
    } catch (err) {
      return {
        valid: false,
        reason: err instanceof Error ? err.message : 'credential decode failed',
      };
    }

    if (!publicKey) {
      // TODO(verify): no Ed25519 public key configured on this credential —
      // cannot verify. Fail closed (treat as unverified) rather than trusting.
      return { valid: false, reason: 'unverified: no publicKey configured' };
    }

    try {
      // Telnyx signs `${timestamp}|${rawBody}` with Ed25519; signature + public
      // key are base64. Node's crypto.verify supports Ed25519 via a raw public
      // key wrapped in a KeyObject (SPKI). We build the SPKI DER prefix for an
      // Ed25519 public key and import it.
      const signedPayload = Buffer.from(`${timestamp}|${payload.rawBody}`, 'utf8');
      const sigBytes = Buffer.from(signature, 'base64');
      const rawKey = Buffer.from(publicKey, 'base64');

      // SPKI DER prefix for Ed25519 (RFC 8410): 12-byte header + 32-byte key.
      const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
      const spki = Buffer.concat([SPKI_PREFIX, rawKey]);
      const keyObject = crypto.createPublicKey({
        key: spki,
        format: 'der',
        type: 'spki',
      });

      const valid = crypto.verify(null, signedPayload, keyObject, sigBytes);
      return valid
        ? { valid: true }
        : { valid: false, reason: 'ed25519 signature mismatch' };
    } catch (err) {
      // TODO(verify): if SPKI wrapping above proves wrong for some key formats,
      // fall back to a vetted ed25519 lib. Never throw out of verify.
      return {
        valid: false,
        reason: err instanceof Error
          ? `ed25519 verify error: ${err.message}`
          : 'ed25519 verify error',
      };
    }
  }

  async handleInboundWebhook(
    payload: VoiceInboundWebhookPayload,
  ): Promise<VoiceEvent[]> {
    let parsed: {
      data?: {
        event_type?: string;
        payload?: {
          call_control_id?: string;
          hangup_cause?: string;
          sip_hangup_cause?: string;
          digits?: string;
          recording_urls?: { mp3?: string; wav?: string };
          public_recording_urls?: { mp3?: string; wav?: string };
          duration_millis?: number;
          start_time?: string;
          end_time?: string;
        };
      };
    };

    try {
      parsed = JSON.parse(payload.rawBody);
    } catch {
      return [];
    }

    const eventType = parsed.data?.event_type;
    const p = parsed.data?.payload;
    const providerCallId = p?.call_control_id;
    if (!eventType || !providerCallId) return [];

    const at = new Date();
    const events: VoiceEvent[] = [];

    switch (eventType) {
      case 'call.initiated':
        events.push({ type: 'call.initiated', providerCallId, at });
        break;
      case 'call.ringing':
        events.push({ type: 'call.ringing', providerCallId, at });
        break;
      case 'call.answered':
        events.push({ type: 'call.answered', providerCallId, at });
        break;
      case 'call.hangup': {
        const cause = p?.hangup_cause ?? p?.sip_hangup_cause;
        const normalCauses = new Set(['normal_clearing', 'completed', 'hangup']);
        if (cause && !normalCauses.has(cause)) {
          events.push({
            type: 'call.failed',
            providerCallId,
            at,
            errorCode: cause,
            errorMessage: cause,
          });
        } else {
          events.push({
            type: 'call.completed',
            providerCallId,
            at,
            durationSec: p?.duration_millis
              ? Math.round(p.duration_millis / 1000)
              : 0,
            endReason: cause ?? undefined,
          });
        }
        break;
      }
      case 'call.dtmf.received':
        if (p?.digits) {
          events.push({ type: 'dtmf.received', providerCallId, at, digits: p.digits });
        }
        break;
      case 'call.recording.saved': {
        const recordingUrl = p?.public_recording_urls?.mp3
          ?? p?.recording_urls?.mp3
          ?? p?.public_recording_urls?.wav
          ?? p?.recording_urls?.wav;
        if (recordingUrl) {
          events.push({
            type: 'recording.available',
            providerCallId,
            at,
            recordingUrl,
            durationSec: p?.duration_millis
              ? Math.round(p.duration_millis / 1000)
              : undefined,
            mimeType: recordingUrl.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
          });
        }
        break;
      }
      // Other Telnyx events (call.bridged, streaming.*) carry no user-visible
      // lifecycle change here; the media worker handles streaming separately.
      default:
        break;
    }

    return events;
  }
}

export const telnyxProvider = new TelnyxProvider();
registerVoiceProvider(telnyxProvider);
