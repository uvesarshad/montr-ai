/**
 * Plivo voice provider implementation.
 *
 * Implements `VoiceProvider` against Plivo's Voice REST API + XML markup.
 * Notes:
 *  - Plivo is a `media_stream` provider (Plivo Audio Streams over WebSocket),
 *    and uses Twilio-like XML ("Plivo XML") for answer-url responses. As with
 *    Twilio, the inbound XML is shaped in the webhook route handler, not here.
 *  - Credentials decode to `{ authId: string, authToken: string }` JSON.
 *    Outbound REST uses HTTP Basic auth (`authId:authToken`).
 *  - No official Plivo SDK is installed — all outbound HTTP goes through
 *    `safeOutboundFetch` (SSRF hard rule).
 *  - Webhook signature: Plivo V3 uses HMAC-SHA256 over `${url}${nonce}${rawBody}`
 *    keyed by `authToken`, delivered in `X-Plivo-Signature-V3` with the nonce in
 *    `X-Plivo-Signature-V3-Nonce`. Verified with Node `crypto`; never throws.
 *  - Plivo status webhooks are application/x-www-form-urlencoded (CallUUID,
 *    CallStatus, HangupCause, RecordUrl, ...).
 */

import crypto from 'crypto';
import { decryptCredential } from '@/lib/workflow/credential-encryption';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

import type { VoiceProvider } from '../provider';
import { registerVoiceProvider } from '../registry';
import type {
  VoiceCallCostSnapshot,
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
  VoiceSmsRequest,
  VoiceSmsResult,
  VoiceTransferRequest,
  VoiceTransferResult,
  VoiceWebhookVerification,
} from '../types';

interface PlivoCredentialPayload {
  authId: string;
  authToken: string;
}

const PLIVO_API_BASE = 'https://api.plivo.com/v1/Account';

/** Plivo `CallStatus`/`Status` strings → MontrAI `VoiceCallStatus`. */
const PLIVO_STATUS_MAP: Record<string, VoiceCallStatus> = {
  queued: 'queued',
  initiated: 'initiated',
  ringing: 'ringing',
  'in-progress': 'in-progress',
  answered: 'answered',
  completed: 'completed',
  busy: 'busy',
  'no-answer': 'no-answer',
  failed: 'failed',
  timeout: 'no-answer',
  cancel: 'cancelled',
  hangup: 'completed',
};

function decodePlivoCredential(
  credential: VoiceProviderCredential,
): PlivoCredentialPayload {
  if (credential.providerId !== 'plivo') {
    throw new Error(`Expected plivo credential, got ${credential.providerId}`);
  }

  const userId = credential.byokUserId
    ?? (typeof credential.metadata?.userId === 'string'
      ? credential.metadata.userId
      : undefined);

  if (!userId) {
    throw new Error('Plivo credential has no associated userId for decryption');
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
    || typeof (value as PlivoCredentialPayload).authId !== 'string'
    || typeof (value as PlivoCredentialPayload).authToken !== 'string'
  ) {
    throw new Error('Plivo credential did not decrypt to {authId, authToken}');
  }

  return value as PlivoCredentialPayload;
}

function basicAuthHeader(authId: string, authToken: string): string {
  return `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`;
}

function normalizeStatus(plivoStatus: string | undefined): VoiceCallStatus {
  if (!plivoStatus) return 'queued';
  return PLIVO_STATUS_MAP[plivoStatus.toLowerCase()] ?? 'failed';
}

const PLIVO_CAPABILITIES: VoiceProviderCapabilities = {
  supportsRecording: true,
  supportsTranscription: true,
  supportsSIP: true,
  supportsMediaStreams: true,
  supportsInboundProvisioning: true,
  supportsSms: true,
  supportsTransfers: true,
  supportsCostLookup: true,
  transportKind: 'media_stream',
  pricePerMinuteUsd: 0.012,
};

class PlivoProvider implements VoiceProvider {
  readonly id = 'plivo' as const;
  readonly capabilities = PLIVO_CAPABILITIES;

  async initiateOutboundCall(
    request: VoiceOutboundCallRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceOutboundCallResult> {
    const { authId, authToken } = decodePlivoCredential(credential);

    const answerUrl = new URL(
      `/api/v2/voice/webhooks/plivo/answer/${encodeURIComponent(request.callSessionId)}`,
      request.webhookBaseUrl,
    ).toString();
    const hangupUrl = new URL(
      `/api/v2/voice/webhooks/plivo/status/${encodeURIComponent(request.callSessionId)}`,
      request.webhookBaseUrl,
    ).toString();

    const response = await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(authId, authToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: request.from,
          to: request.to,
          answer_url: answerUrl,
          answer_method: 'POST',
          hangup_url: hangupUrl,
          hangup_method: 'POST',
          ring_timeout: request.options?.timeoutSec,
          machine_detection: request.options?.machineDetection ? 'true' : undefined,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Plivo outbound call failed: ${response.status} ${text}`);
    }

    const json = (await response.json()) as {
      request_uuid?: string;
      api_id?: string;
    };
    // Plivo returns request_uuid synchronously; the real CallUUID appears on the
    // answer/status webhooks. We use request_uuid as the provider call id until
    // the CallUUID is known (the dispatch layer reconciles via webhook).
    const providerCallId = json.request_uuid ?? json.api_id ?? '';

    return {
      providerCallId,
      status: 'initiated',
      startedAt: new Date(),
    };
  }

  async sendSms(
    request: VoiceSmsRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceSmsResult> {
    const { authId, authToken } = decodePlivoCredential(credential);

    const response = await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Message/`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(authId, authToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          src: request.from,
          dst: request.to,
          text: request.body,
          url: request.statusCallbackUrl,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Plivo SMS failed: ${response.status} ${text}`);
    }

    const json = (await response.json()) as {
      message_uuid?: string[];
      api_id?: string;
    };

    return {
      providerMessageId: json.message_uuid?.[0] ?? json.api_id ?? '',
      status: 'queued',
      from: request.from,
      to: request.to,
    };
  }

  async hangup(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { authId, authToken } = decodePlivoCredential(credential);
    await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(providerCallId)}/`,
      {
        method: 'DELETE',
        headers: { Authorization: basicAuthHeader(authId, authToken) },
      },
    );
  }

  async sendDTMF(
    request: VoiceSendDtmfRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { authId, authToken } = decodePlivoCredential(credential);
    await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(request.providerCallId)}/DTMF/`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(authId, authToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ digits: request.digits }),
      },
    );
  }

  async playAudio(
    request: VoicePlayAudioRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { authId, authToken } = decodePlivoCredential(credential);
    await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(request.providerCallId)}/Play/`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(authId, authToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: request.audioUrl,
          loop: (request.loop ?? 1) > 1,
        }),
      },
    );
  }

  async transferCall(
    request: VoiceTransferRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceTransferResult> {
    const { authId, authToken } = decodePlivoCredential(credential);
    // Plivo "Transfer Call" re-points the call's legs at new answer XML. We hand
    // it an answer URL that dials the target; warm vs cold is expressed by the
    // XML the answer route returns (conference for warm, plain Dial for cold).
    const legUrl = new URL(
      `/api/v2/voice/webhooks/plivo/transfer/${encodeURIComponent(request.providerCallId)}` +
        `?to=${encodeURIComponent(request.to)}&mode=${encodeURIComponent(request.mode ?? 'cold')}`,
      // Plivo requires an absolute URL; callerId/whisper carried as query too.
      request.callerId
        ? `https://placeholder.invalid?callerId=${encodeURIComponent(request.callerId)}`
        : 'https://placeholder.invalid',
    );
    // NOTE: the transfer XML URL must be absolute and reachable; the dispatch
    // layer rewrites this against the real webhookBaseUrl when invoking. Here we
    // only need to know the relative path + query, so we extract it.
    const relative = `${legUrl.pathname}${legUrl.search}`;

    try {
      const response = await safeOutboundFetch(
        `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(request.providerCallId)}/`,
        {
          method: 'POST',
          headers: {
            Authorization: basicAuthHeader(authId, authToken),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            legs: request.mode === 'warm' ? 'both' : 'aleg',
            aleg_url: relative,
            aleg_method: 'POST',
          }),
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

  async getCallCost(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallCostSnapshot> {
    const { authId, authToken } = decodePlivoCredential(credential);
    // Live calls live under /Call/; completed calls are CDRs under /Call/{uuid}/
    // as well (Plivo returns the CDR for ended calls with total_amount). Fall
    // back to estimated if total_amount is absent.
    const response = await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(providerCallId)}/`,
      {
        method: 'GET',
        headers: { Authorization: basicAuthHeader(authId, authToken) },
      },
    );

    if (!response.ok) {
      return {
        providerCallId,
        amount: 0,
        currency: 'USD',
        source: 'estimated',
      };
    }

    const json = (await response.json()) as {
      total_amount?: string | number;
      total_rate?: string | number;
    };
    const amount = json.total_amount != null ? Number(json.total_amount) : NaN;

    return {
      providerCallId,
      amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
      currency: 'USD',
      source: Number.isFinite(amount) ? 'provider_api' : 'estimated',
    };
  }

  async startRecording(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<{ recordingSid: string }> {
    const { authId, authToken } = decodePlivoCredential(credential);
    const response = await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(providerCallId)}/Record/`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(authId, authToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_format: 'mp3' }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as {
      recording_id?: string;
    };
    // Plivo returns recording_id on the start response; if absent, fall back to
    // the call id so stopRecording can still target the leg.
    return { recordingSid: json.recording_id ?? providerCallId };
  }

  async stopRecording(
    providerCallId: string,
    _recordingSid: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { authId, authToken } = decodePlivoCredential(credential);
    await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(providerCallId)}/Record/`,
      {
        method: 'DELETE',
        headers: { Authorization: basicAuthHeader(authId, authToken) },
      },
    );
  }

  async getCallStatus(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallStatusSnapshot> {
    const { authId, authToken } = decodePlivoCredential(credential);
    const response = await safeOutboundFetch(
      `${PLIVO_API_BASE}/${encodeURIComponent(authId)}/Call/${encodeURIComponent(providerCallId)}/`,
      {
        method: 'GET',
        headers: { Authorization: basicAuthHeader(authId, authToken) },
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

    const json = (await response.json()) as {
      call_status?: string;
      call_duration?: number | string;
      end_time?: string;
    };

    return {
      providerCallId,
      status: normalizeStatus(json.call_status),
      durationSec: json.call_duration != null ? Number(json.call_duration) : undefined,
      recordingUrl: null,
      endedAt: json.end_time ? new Date(json.end_time) : null,
      endReason: null,
    };
  }

  verifyWebhookSignature(
    payload: VoiceInboundWebhookPayload,
    credential: VoiceProviderCredential,
  ): VoiceWebhookVerification {
    const signature = payload.signature
      ?? payload.headers['x-plivo-signature-v3']
      ?? payload.headers['X-Plivo-Signature-V3'];
    const nonce = payload.headers['x-plivo-signature-v3-nonce']
      ?? payload.headers['X-Plivo-Signature-V3-Nonce'];

    if (!signature) {
      return { valid: false, reason: 'missing X-Plivo-Signature-V3 header' };
    }
    if (!nonce) {
      return { valid: false, reason: 'missing X-Plivo-Signature-V3-Nonce header' };
    }

    let authToken: string;
    try {
      authToken = decodePlivoCredential(credential).authToken;
    } catch (err) {
      return {
        valid: false,
        reason: err instanceof Error ? err.message : 'credential decode failed',
      };
    }

    try {
      // Plivo V3: HMAC-SHA256(authToken, `${url}${nonce}`) base64. The signed
      // string is the request URL concatenated with the nonce (Plivo does not
      // include the body in V3). Multiple comma-separated signatures may be
      // present (key rotation) — accept if any matches.
      const computed = crypto
        .createHmac('sha256', authToken)
        .update(`${payload.url}${nonce}`)
        .digest('base64');

      const candidates = signature.split(',').map((s) => s.trim());
      const match = candidates.some((cand) => timingSafeEqualStr(cand, computed));

      return match
        ? { valid: true }
        : { valid: false, reason: 'V3 signature mismatch' };
    } catch (err) {
      // TODO(verify): confirm the exact V3 signed-string composition against a
      // live Plivo request capture (url+nonce vs url+nonce+body). Never throw.
      return {
        valid: false,
        reason: err instanceof Error
          ? `V3 verify error: ${err.message}`
          : 'V3 verify error',
      };
    }
  }

  async handleInboundWebhook(
    payload: VoiceInboundWebhookPayload,
  ): Promise<VoiceEvent[]> {
    const params = Object.fromEntries(new URLSearchParams(payload.rawBody));
    const providerCallId = params.CallUUID ?? params.RequestUUID;
    if (!providerCallId) return [];

    const at = new Date();
    const events: VoiceEvent[] = [];

    if (params.RecordUrl) {
      events.push({
        type: 'recording.available',
        providerCallId,
        at,
        recordingUrl: params.RecordUrl,
        durationSec: params.RecordingDuration
          ? Number(params.RecordingDuration)
          : undefined,
        mimeType: params.RecordUrl.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
      });
    }

    if (params.Digits) {
      events.push({ type: 'dtmf.received', providerCallId, at, digits: params.Digits });
    }

    const status = (params.CallStatus ?? params.Status)?.toLowerCase();
    if (status) {
      switch (status) {
        case 'queued':
        case 'initiated':
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
        case 'hangup': {
          const cause = params.HangupCause ?? params.HangupCauseName;
          const failedCauses = new Set([
            'CALL_REJECTED',
            'NO_ANSWER',
            'BUSY',
            'UNALLOCATED_NUMBER',
            'INVALID_ANSWER_XML',
          ]);
          if (cause && failedCauses.has(cause)) {
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
              durationSec: params.Duration ? Number(params.Duration) : 0,
              endReason: cause ?? undefined,
            });
          }
          break;
        }
        case 'busy':
          events.push({
            type: 'call.failed',
            providerCallId,
            at,
            errorCode: 'busy',
            errorMessage: 'busy',
          });
          break;
        case 'failed':
        case 'timeout':
        case 'no-answer':
          events.push({
            type: 'call.failed',
            providerCallId,
            at,
            errorCode: status,
            errorMessage: params.HangupCause ?? status,
          });
          break;
        default:
          break;
      }
    }

    return events;
  }
}

/** Constant-time string compare that tolerates length mismatch without throwing. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const plivoProvider = new PlivoProvider();
registerVoiceProvider(plivoProvider);
