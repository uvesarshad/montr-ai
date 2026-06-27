/**
 * Cloudonix voice provider implementation.
 *
 * Implements `VoiceProvider` against Cloudonix's REST API + CXML (Cloudonix's
 * Twilio-compatible XML dialect).
 * Notes:
 *  - Cloudonix is a `media_stream` provider and speaks CXML, which is largely
 *    TwiML-compatible (<Response>, <Dial>, <Play>, <Conference>). As with
 *    Twilio/Plivo, the answer-url XML is shaped in the webhook route, not here.
 *  - Credentials decode to `{ domain: string, apiKey: string }` JSON. `domain`
 *    is the Cloudonix application/voice domain; `apiKey` is a session/API key
 *    used as a Bearer token.
 *  - No official Cloudonix SDK is installed — outbound HTTP uses
 *    `safeOutboundFetch` (SSRF hard rule).
 *  - ASSUMPTION: Cloudonix's exact REST surface and webhook signing are not
 *    pinned here. Endpoints follow the documented `api.cloudonix.io` shape with
 *    domain-scoped paths; where uncertain, behavior is marked TODO(verify) with
 *    SAFE fallbacks. We do NOT claim a verified signature where none is proven.
 */

import { decryptCredential } from '@/lib/workflow/credential-encryption';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

import type { VoiceProvider } from '../provider';
import { registerVoiceProvider } from '../registry';
import type {
  VoiceCallStatus,
  VoiceCallStatusSnapshot,
  VoiceEvent,
  VoiceInboundWebhookPayload,
  VoiceOutboundCallRequest,
  VoiceOutboundCallResult,
  VoicePlayAudioRequest,
  VoiceProviderCapabilities,
  VoiceProviderCredential,
  VoiceSendDtmfRequest,
  VoiceTransferRequest,
  VoiceTransferResult,
  VoiceWebhookVerification,
} from '../types';

interface CloudonixCredentialPayload {
  domain: string;
  apiKey: string;
}

const CLOUDONIX_API_BASE = 'https://api.cloudonix.io';

/**
 * Cloudonix call status strings → MontrAI `VoiceCallStatus`. Cloudonix uses
 * CXML-compatible statuses; we map them the same way as Twilio.
 * TODO(verify): confirm against live Cloudonix status-callback payloads.
 */
const CLOUDONIX_STATUS_MAP: Record<string, VoiceCallStatus> = {
  queued: 'queued',
  initiated: 'initiated',
  ringing: 'ringing',
  'in-progress': 'in-progress',
  answered: 'answered',
  completed: 'completed',
  busy: 'busy',
  'no-answer': 'no-answer',
  failed: 'failed',
  canceled: 'cancelled',
  cancelled: 'cancelled',
};

function decodeCloudonixCredential(
  credential: VoiceProviderCredential,
): CloudonixCredentialPayload {
  if (credential.providerId !== 'cloudonix') {
    throw new Error(`Expected cloudonix credential, got ${credential.providerId}`);
  }

  const userId = credential.byokUserId
    ?? (typeof credential.metadata?.userId === 'string'
      ? credential.metadata.userId
      : undefined);

  if (!userId) {
    throw new Error('Cloudonix credential has no associated userId for decryption');
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
    || typeof (value as CloudonixCredentialPayload).domain !== 'string'
    || typeof (value as CloudonixCredentialPayload).apiKey !== 'string'
  ) {
    throw new Error('Cloudonix credential did not decrypt to {domain, apiKey}');
  }

  return value as CloudonixCredentialPayload;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function normalizeStatus(status: string | undefined): VoiceCallStatus {
  if (!status) return 'queued';
  return CLOUDONIX_STATUS_MAP[status.toLowerCase()] ?? 'failed';
}

const CLOUDONIX_CAPABILITIES: VoiceProviderCapabilities = {
  supportsRecording: true,
  supportsTranscription: false,
  supportsSIP: true,
  supportsMediaStreams: true,
  supportsInboundProvisioning: true,
  supportsSms: false,
  supportsTransfers: true,
  supportsCostLookup: false,
  transportKind: 'media_stream',
  pricePerMinuteUsd: 0.011,
};

class CloudonixProvider implements VoiceProvider {
  readonly id = 'cloudonix' as const;
  readonly capabilities = CLOUDONIX_CAPABILITIES;

  async initiateOutboundCall(
    request: VoiceOutboundCallRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceOutboundCallResult> {
    const { domain, apiKey } = decodeCloudonixCredential(credential);

    const callbackUrl = new URL(
      `/api/v2/voice/webhooks/cloudonix/${encodeURIComponent(request.callSessionId)}`,
      request.webhookBaseUrl,
    ).toString();

    // TODO(verify): Cloudonix outbound-call endpoint shape. Documented surface
    // is domain-scoped under /calls/{domain}. We pass a CXML callback URL the
    // same way Twilio uses `url`.
    const response = await safeOutboundFetch(
      `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}`,
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          destination: request.to,
          callerId: request.from,
          callbackUrl,
          callbackMethod: 'POST',
          timeout: request.options?.timeoutSec,
          record: request.options?.recordCall ?? false,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Cloudonix outbound call failed: ${response.status} ${text}`);
    }

    const json = (await response.json().catch(() => ({}))) as {
      callId?: string;
      id?: string;
      token?: string;
      status?: string;
    };
    const providerCallId = json.callId ?? json.id ?? json.token ?? '';
    if (!providerCallId) {
      throw new Error('Cloudonix outbound call response missing call id');
    }

    return {
      providerCallId,
      status: normalizeStatus(json.status) ?? 'initiated',
      startedAt: new Date(),
    };
  }

  async hangup(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { domain, apiKey } = decodeCloudonixCredential(credential);
    await safeOutboundFetch(
      `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}/${encodeURIComponent(providerCallId)}`,
      {
        method: 'DELETE',
        headers: authHeaders(apiKey),
      },
    );
  }

  async sendDTMF(
    request: VoiceSendDtmfRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { domain, apiKey } = decodeCloudonixCredential(credential);
    // TODO(verify): Cloudonix mid-call DTMF endpoint. Best-effort: post a CXML
    // <Play digits="..."> redirect to the live call, mirroring Twilio.
    await safeOutboundFetch(
      `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}/${encodeURIComponent(request.providerCallId)}`,
      {
        method: 'PUT',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          cxml: `<Response><Play digits="${escapeXml(request.digits)}"/></Response>`,
        }),
      },
    );
  }

  async playAudio(
    request: VoicePlayAudioRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { domain, apiKey } = decodeCloudonixCredential(credential);
    const loop = request.loop ?? 1;
    // TODO(verify): mid-call media injection endpoint. Best-effort CXML redirect.
    await safeOutboundFetch(
      `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}/${encodeURIComponent(request.providerCallId)}`,
      {
        method: 'PUT',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          cxml: `<Response><Play loop="${loop}">${escapeXml(request.audioUrl)}</Play></Response>`,
        }),
      },
    );
  }

  async transferCall(
    request: VoiceTransferRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceTransferResult> {
    const { domain, apiKey } = decodeCloudonixCredential(credential);
    // Cloudonix is CXML-compatible, so transfer is a <Dial> (cold) or
    // <Dial><Conference> (warm) redirect on the live leg, mirroring Twilio.
    const callerId = request.callerId
      ? ` callerId="${escapeXml(request.callerId)}"`
      : '';
    const cxml =
      request.mode === 'warm'
        ? `<Response><Dial${callerId}><Conference startConferenceOnEnter="true" endConferenceOnExit="false">transfer-${escapeXml(request.providerCallId)}</Conference></Dial></Response>`
        : `<Response><Dial${callerId}>${escapeXml(request.to)}</Dial></Response>`;
    try {
      const response = await safeOutboundFetch(
        `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}/${encodeURIComponent(request.providerCallId)}`,
        {
          method: 'PUT',
          headers: authHeaders(apiKey),
          body: JSON.stringify({ cxml }),
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
    const { domain, apiKey } = decodeCloudonixCredential(credential);
    // TODO(verify): record-start endpoint/response shape. Use call id as the
    // correlation handle when no recording id is returned synchronously.
    const response = await safeOutboundFetch(
      `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}/${encodeURIComponent(providerCallId)}/recordings`,
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ format: 'mp3' }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { id?: string };
    return { recordingSid: json.id ?? providerCallId };
  }

  async stopRecording(
    providerCallId: string,
    recordingSid: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { domain, apiKey } = decodeCloudonixCredential(credential);
    // TODO(verify): record-stop endpoint shape.
    await safeOutboundFetch(
      `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}/${encodeURIComponent(providerCallId)}/recordings/${encodeURIComponent(recordingSid)}`,
      {
        method: 'DELETE',
        headers: authHeaders(apiKey),
      },
    );
  }

  async getCallStatus(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallStatusSnapshot> {
    const { domain, apiKey } = decodeCloudonixCredential(credential);
    const response = await safeOutboundFetch(
      `${CLOUDONIX_API_BASE}/calls/${encodeURIComponent(domain)}/${encodeURIComponent(providerCallId)}`,
      {
        method: 'GET',
        headers: authHeaders(apiKey),
      },
    );

    if (!response.ok) {
      return {
        providerCallId,
        status: response.status === 404 ? 'completed' : 'failed',
        recordingUrl: null,
        endedAt: null,
        endReason: null,
      };
    }

    const json = (await response.json().catch(() => ({}))) as {
      status?: string;
      duration?: number | string;
      endTime?: string;
    };

    return {
      providerCallId,
      status: normalizeStatus(json.status),
      durationSec: json.duration != null ? Number(json.duration) : undefined,
      recordingUrl: null,
      endedAt: json.endTime ? new Date(json.endTime) : null,
      endReason: null,
    };
  }

  verifyWebhookSignature(
    payload: VoiceInboundWebhookPayload,
    credential: VoiceProviderCredential,
  ): VoiceWebhookVerification {
    // Decode the credential first so a malformed credential is reported clearly
    // rather than silently passing.
    try {
      decodeCloudonixCredential(credential);
    } catch (err) {
      return {
        valid: false,
        reason: err instanceof Error ? err.message : 'credential decode failed',
      };
    }

    // TODO(verify): Cloudonix webhook signing scheme is not confirmed. Until the
    // exact header + algorithm are pinned against a live capture, fail closed
    // (unverified) rather than fake a valid signature. The webhook route should
    // additionally enforce a shared-secret path/token as a stopgap.
    return { valid: false, reason: 'unverified: Cloudonix signing scheme TBD' };
  }

  async handleInboundWebhook(
    payload: VoiceInboundWebhookPayload,
  ): Promise<VoiceEvent[]> {
    // Cloudonix CXML status callbacks are form-urlencoded and largely mirror
    // Twilio's field names (CallSid, CallStatus, RecordingUrl, Digits).
    // TODO(verify): exact field names against a live Cloudonix callback; the
    // parsing below uses safe fallbacks and emits nothing for unknown shapes.
    const params = Object.fromEntries(new URLSearchParams(payload.rawBody));
    const providerCallId = params.CallSid ?? params.callId ?? params.CallId;
    if (!providerCallId) return [];

    const at = new Date();
    const events: VoiceEvent[] = [];

    const recordingUrl = params.RecordingUrl ?? params.recordingUrl;
    if (recordingUrl) {
      events.push({
        type: 'recording.available',
        providerCallId,
        at,
        recordingUrl,
        durationSec: params.RecordingDuration
          ? Number(params.RecordingDuration)
          : undefined,
        mimeType: recordingUrl.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
      });
    }

    const digits = params.Digits ?? params.digits;
    if (digits) {
      events.push({ type: 'dtmf.received', providerCallId, at, digits });
    }

    const status = (params.CallStatus ?? params.status)?.toLowerCase();
    if (status) {
      switch (status) {
        case 'initiated':
        case 'queued':
          events.push({ type: 'call.initiated', providerCallId, at });
          break;
        case 'ringing':
          events.push({ type: 'call.ringing', providerCallId, at });
          break;
        case 'in-progress':
        case 'answered':
          events.push({ type: 'call.answered', providerCallId, at });
          break;
        case 'completed':
          events.push({
            type: 'call.completed',
            providerCallId,
            at,
            durationSec: params.CallDuration ? Number(params.CallDuration) : 0,
          });
          break;
        case 'failed':
        case 'busy':
        case 'no-answer':
        case 'canceled':
        case 'cancelled':
          events.push({
            type: 'call.failed',
            providerCallId,
            at,
            errorCode: params.ErrorCode,
            errorMessage: params.ErrorMessage ?? status,
          });
          break;
        default:
          break;
      }
    }

    return events;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const cloudonixProvider = new CloudonixProvider();
registerVoiceProvider(cloudonixProvider);
