/**
 * Twilio voice provider implementation.
 *
 * Implements `VoiceProvider` against Twilio's Voice REST API + webhooks.
 * Notes:
 *  - Credentials decode to `{ accountSid: string, authToken: string }` JSON.
 *  - Webhook signature verification uses Twilio's `validateRequestWithBody`.
 *  - Recording webhooks fetch the audio with HTTP Basic auth and upload to
 *    MontrAI's storage service (S3/Wasabi/etc) before emitting the normalized
 *    `recording.available` event with the new MontrAI-owned URL.
 *  - Inbound TwiML responses are NOT shaped here — that lives in the webhook
 *    route handler so the same provider impl can serve REST-only flows.
 */

import twilio from 'twilio';
import { decryptCredential } from '@/lib/workflow/credential-encryption';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import { storageService } from '@/lib/storage/storage-service';

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

interface TwilioCredentialPayload {
  accountSid: string;
  authToken: string;
}

const TWILIO_STATUS_MAP: Record<string, VoiceCallStatus> = {
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
};

function decodeTwilioCredential(
  credential: VoiceProviderCredential,
): TwilioCredentialPayload {
  if (credential.providerId !== 'twilio') {
    throw new Error(`Expected twilio credential, got ${credential.providerId}`);
  }

  // Credentials are scoped to a user: BYOK uses byokUserId, system credentials
  // use a service userId stored in metadata. The decrypt step ignores anything
  // it can't derive a userId for.
  const userId = credential.byokUserId
    ?? (typeof credential.metadata?.userId === 'string'
      ? credential.metadata.userId
      : undefined);

  if (!userId) {
    throw new Error('Twilio credential has no associated userId for decryption');
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
    || typeof (value as TwilioCredentialPayload).accountSid !== 'string'
    || typeof (value as TwilioCredentialPayload).authToken !== 'string'
  ) {
    throw new Error('Twilio credential did not decrypt to {accountSid, authToken}');
  }

  return value as TwilioCredentialPayload;
}

function makeClient(credential: VoiceProviderCredential) {
  const { accountSid, authToken } = decodeTwilioCredential(credential);
  return twilio(accountSid, authToken);
}

function normalizeStatus(twilioStatus: string | undefined): VoiceCallStatus {
  if (!twilioStatus) return 'queued';
  return TWILIO_STATUS_MAP[twilioStatus] ?? 'failed';
}

/**
 * Normalize Twilio's `AnsweredBy` AMD verdict into MontrAI's coarse result.
 * Any `machine_*` variant collapses to `'machine'`; `human`/`fax` map directly;
 * everything else (including Twilio's literal `unknown`) is `'unknown'`.
 */
function normalizeAnsweredBy(
  answeredBy: string,
): 'human' | 'machine' | 'fax' | 'unknown' {
  if (answeredBy.startsWith('machine')) return 'machine';
  if (answeredBy === 'human') return 'human';
  if (answeredBy === 'fax') return 'fax';
  return 'unknown';
}

const TWILIO_CAPABILITIES: VoiceProviderCapabilities = {
  supportsRecording: true,
  supportsTranscription: true,
  supportsSIP: true,
  supportsMediaStreams: true,
  supportsInboundProvisioning: true,
  supportsSms: true,
  supportsTransfers: true,
  supportsCostLookup: true,
  transportKind: 'media_stream',
  pricePerMinuteUsd: 0.013,
};

class TwilioProvider implements VoiceProvider {
  readonly id = 'twilio' as const;
  readonly capabilities = TWILIO_CAPABILITIES;

  async initiateOutboundCall(
    request: VoiceOutboundCallRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceOutboundCallResult> {
    const client = makeClient(credential);

    const statusCallbackUrl = new URL(
      `/api/v2/voice/webhooks/twilio/status/${encodeURIComponent(request.callSessionId)}`,
      request.webhookBaseUrl,
    ).toString();

    const answerUrl = new URL(
      `/api/v2/voice/webhooks/twilio/answer/${encodeURIComponent(request.callSessionId)}`,
      request.webhookBaseUrl,
    ).toString();

    const call = await client.calls.create({
      from: request.from,
      to: request.to,
      url: answerUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: request.options?.statusCallbackEvents
        ?? ['initiated', 'ringing', 'answered', 'completed'],
      record: request.options?.recordCall ?? false,
      machineDetection: request.options?.machineDetection ? 'Enable' : undefined,
      timeout: request.options?.timeoutSec,
    });

    return {
      providerCallId: call.sid,
      status: normalizeStatus(call.status),
      startedAt: call.dateCreated ?? new Date(),
    };
  }

  async sendSms(
    request: VoiceSmsRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceSmsResult> {
    const client = makeClient(credential);
    const message = await client.messages.create({
      from: request.from,
      to: request.to,
      body: request.body,
      statusCallback: request.statusCallbackUrl,
    });

    return {
      providerMessageId: message.sid,
      status: message.status ?? 'queued',
      from: request.from,
      to: request.to,
    };
  }

  async hangup(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const client = makeClient(credential);
    await client.calls(providerCallId).update({ status: 'completed' });
  }

  async sendDTMF(
    request: VoiceSendDtmfRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const client = makeClient(credential);
    // Twilio: digits sent via TwiML <Play digits="..."> or by updating the call
    // with a new TwiML URL. The simplest path is to use the REST API's
    // sendDigits parameter when creating the call; mid-call DTMF requires
    // a re-routed call with TwiML containing <Play digits="...">.
    await client.calls(request.providerCallId).update({
      twiml: `<Response><Play digits="${escapeXml(request.digits)}"/></Response>`,
    });
  }

  async playAudio(
    request: VoicePlayAudioRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const client = makeClient(credential);
    const loop = request.loop ?? 1;
    await client.calls(request.providerCallId).update({
      twiml: `<Response><Play loop="${loop}">${escapeXml(request.audioUrl)}</Play></Response>`,
    });
  }

  async transferCall(
    request: VoiceTransferRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceTransferResult> {
    const client = makeClient(credential);
    // Cold transfer: redirect the caller's leg to dial the target directly.
    // Warm transfer: bridge both legs into a conference (the agent stays until
    // it drops). We model warm as a conference dial; the agent worker is
    // responsible for whispering context before dropping.
    const callerId = request.callerId ? ` callerId="${escapeXml(request.callerId)}"` : '';
    const twiml =
      request.mode === 'warm'
        ? `<Response><Dial${callerId}><Conference startConferenceOnEnter="true" endConferenceOnExit="false">transfer-${escapeXml(request.providerCallId)}</Conference></Dial></Response>`
        : `<Response><Dial${callerId}>${escapeXml(request.to)}</Dial></Response>`;
    try {
      await client.calls(request.providerCallId).update({ twiml });
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
    const client = makeClient(credential);
    const call = await client.calls(providerCallId).fetch();
    const price = call.price ? Math.abs(Number(call.price)) : 0;
    return {
      providerCallId,
      amount: Number.isFinite(price) ? price : 0,
      currency: call.priceUnit ?? 'USD',
      source: call.price ? 'provider_api' : 'estimated',
    };
  }

  async startRecording(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<{ recordingSid: string }> {
    const client = makeClient(credential);
    const recording = await client.calls(providerCallId).recordings.create({});
    return { recordingSid: recording.sid };
  }

  async stopRecording(
    providerCallId: string,
    recordingSid: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const client = makeClient(credential);
    await client
      .calls(providerCallId)
      .recordings(recordingSid)
      .update({ status: 'stopped' });
  }

  async getCallStatus(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallStatusSnapshot> {
    const client = makeClient(credential);
    const call = await client.calls(providerCallId).fetch();

    return {
      providerCallId: call.sid,
      status: normalizeStatus(call.status),
      durationSec: call.duration ? Number(call.duration) : undefined,
      recordingUrl: null,
      endedAt: call.endTime ?? null,
      endReason: call.status === 'failed' ? 'failed' : null,
    };
  }

  verifyWebhookSignature(
    payload: VoiceInboundWebhookPayload,
    credential: VoiceProviderCredential,
  ): VoiceWebhookVerification {
    const signature = payload.signature
      ?? payload.headers['x-twilio-signature']
      ?? payload.headers['X-Twilio-Signature'];

    if (!signature) {
      return { valid: false, reason: 'missing x-twilio-signature header' };
    }

    let authToken: string;
    try {
      authToken = decodeTwilioCredential(credential).authToken;
    } catch (err) {
      return {
        valid: false,
        reason: err instanceof Error ? err.message : 'credential decode failed',
      };
    }

    // Twilio webhooks are application/x-www-form-urlencoded — parse rawBody.
    const params = Object.fromEntries(new URLSearchParams(payload.rawBody));
    const valid = twilio.validateRequest(
      authToken,
      signature,
      payload.url,
      params,
    );

    return valid ? { valid: true } : { valid: false, reason: 'signature mismatch' };
  }

  async handleInboundWebhook(
    payload: VoiceInboundWebhookPayload,
  ): Promise<VoiceEvent[]> {
    const params = Object.fromEntries(new URLSearchParams(payload.rawBody));
    const providerCallId = params.CallSid;
    if (!providerCallId) return [];

    const at = new Date();
    const callStatus = params.CallStatus;
    const events: VoiceEvent[] = [];

    if (params.RecordingUrl) {
      const mirrored = await mirrorRecording(
        params.RecordingUrl,
        providerCallId,
      );
      events.push({
        type: 'recording.available',
        providerCallId,
        at,
        recordingUrl: mirrored.url,
        durationSec: params.RecordingDuration ? Number(params.RecordingDuration) : undefined,
        mimeType: mirrored.mimeType,
      });
    }

    if (params.Digits) {
      events.push({
        type: 'dtmf.received',
        providerCallId,
        at,
        digits: params.Digits,
      });
    }

    // Twilio answering-machine detection (AMD) reports its verdict via the
    // `AnsweredBy` param on the status callback / dedicated AMD callback.
    // Values: human | machine_start | machine_end_beep | machine_end_silence
    //         | machine_end_other | fax | unknown.
    if (params.AnsweredBy) {
      events.push({
        type: 'amd.result',
        providerCallId,
        at,
        result: normalizeAnsweredBy(params.AnsweredBy),
        rawAnsweredBy: params.AnsweredBy,
      });
    }

    if (callStatus) {
      switch (callStatus) {
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
          events.push({
            type: 'call.failed',
            providerCallId,
            at,
            errorCode: params.ErrorCode,
            errorMessage: params.ErrorMessage ?? callStatus,
          });
          break;
      }
    }

    return events;
  }
}

/**
 * Download a Twilio recording and store it in MontrAI's storage service so the
 * URL we hand to workflow consumers is provider-independent and tied to our
 * retention rules.
 */
async function mirrorRecording(
  twilioRecordingUrl: string,
  providerCallId: string,
): Promise<{ url: string; mimeType: string }> {
  // Twilio recording URLs need the `.mp3` extension appended explicitly.
  const sourceUrl = twilioRecordingUrl.endsWith('.mp3')
    ? twilioRecordingUrl
    : `${twilioRecordingUrl}.mp3`;

  const response = await safeOutboundFetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Twilio recording: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') ?? 'audio/mpeg';

  const uploadResult = await storageService.upload(buffer, {
    folder: `voice/recordings/${providerCallId}`,
    filename: `${providerCallId}.mp3`,
    contentType: mimeType,
    isPublic: false,
  });

  return { url: uploadResult.url, mimeType };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const twilioProvider = new TwilioProvider();
registerVoiceProvider(twilioProvider);
