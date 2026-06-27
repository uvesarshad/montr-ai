/**
 * Asterisk ARI (Asterisk REST Interface) voice provider implementation.
 *
 * Implements `VoiceProvider` against a self-hosted Asterisk PBX via ARI.
 * Notes:
 *  - Asterisk is a `call_control` provider with SIP media. Call control is
 *    driven through ARI's REST endpoints (`/ari/channels`, `/ari/bridges`, ...);
 *    live events arrive over an ARI **WebSocket** events stream, NOT webhook
 *    POSTs. So `handleInboundWebhook` returns `[]` and a comment — events are
 *    consumed by the worker's WS subscription (Phase 8). The method is
 *    implemented to satisfy the interface and to normalize an event payload if
 *    one is ever forwarded as JSON.
 *  - Credentials decode to
 *    `{ baseUrl: string, username: string, password: string, appName: string }`.
 *    `baseUrl` is the Asterisk HTTP server root (e.g. https://pbx.example:8088);
 *    `username`/`password` are ARI HTTP Basic creds; `appName` is the Stasis
 *    application the channel is handed to.
 *  - No SDK — outbound HTTP uses `safeOutboundFetch` (SSRF hard rule). NOTE:
 *    `baseUrl` is operator-supplied and may be a private/self-host address; the
 *    SSRF guard may reject RFC-1918 targets. That is acceptable for the public
 *    build; on-prem deployments configure the guard's allowlist.
 *  - There is no public webhook signature for ARI. `verifyWebhookSignature`
 *    returns `{valid:true}` only when HTTP Basic creds in the payload match a
 *    shared secret stored in `credential.metadata.webhookSecret`; otherwise
 *    `{valid:false}`. Never throws.
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

interface AsteriskCredentialPayload {
  baseUrl: string;
  username: string;
  password: string;
  appName: string;
}

/** Asterisk channel `state` → MontrAI `VoiceCallStatus`. */
const ASTERISK_STATE_MAP: Record<string, VoiceCallStatus> = {
  Down: 'queued',
  Rsrved: 'queued',
  OffHook: 'initiated',
  Dialing: 'initiated',
  Ring: 'ringing',
  Ringing: 'ringing',
  Up: 'in-progress',
  Busy: 'busy',
};

function decodeAsteriskCredential(
  credential: VoiceProviderCredential,
): AsteriskCredentialPayload {
  if (credential.providerId !== 'asterisk-ari') {
    throw new Error(`Expected asterisk-ari credential, got ${credential.providerId}`);
  }

  const userId = credential.byokUserId
    ?? (typeof credential.metadata?.userId === 'string'
      ? credential.metadata.userId
      : undefined);

  if (!userId) {
    throw new Error('Asterisk credential has no associated userId for decryption');
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

  const value = decrypted.value as Partial<AsteriskCredentialPayload> | undefined;
  if (
    !value
    || typeof value !== 'object'
    || typeof value.baseUrl !== 'string'
    || typeof value.username !== 'string'
    || typeof value.password !== 'string'
    || typeof value.appName !== 'string'
  ) {
    throw new Error(
      'Asterisk credential did not decrypt to {baseUrl, username, password, appName}',
    );
  }

  return value as AsteriskCredentialPayload;
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** Build a `{baseUrl}/ari/{path}` URL, trimming any trailing slash on baseUrl. */
function ariUrl(baseUrl: string, path: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/ari/${path}`;
}

function normalizeState(state: string | undefined): VoiceCallStatus {
  if (!state) return 'queued';
  return ASTERISK_STATE_MAP[state] ?? 'in-progress';
}

const ASTERISK_CAPABILITIES: VoiceProviderCapabilities = {
  supportsRecording: true,
  supportsTranscription: false,
  supportsSIP: true,
  supportsMediaStreams: false,
  supportsInboundProvisioning: false,
  supportsSms: false,
  supportsTransfers: true,
  supportsCostLookup: false,
  transportKind: 'call_control',
  pricePerMinuteUsd: 0,
};

class AsteriskAriProvider implements VoiceProvider {
  readonly id = 'asterisk-ari' as const;
  readonly capabilities = ASTERISK_CAPABILITIES;

  async initiateOutboundCall(
    request: VoiceOutboundCallRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceOutboundCallResult> {
    const { baseUrl, username, password, appName } =
      decodeAsteriskCredential(credential);

    // ARI originate: create a channel to `endpoint` and hand it to the Stasis
    // app. `endpoint` is typically a SIP/PJSIP dial string; we accept an E.164
    // and assume a PJSIP trunk endpoint named by metadata.trunk, falling back to
    // a raw PJSIP/{to} form.
    const trunk = typeof credential.metadata?.trunk === 'string'
      ? credential.metadata.trunk
      : undefined;
    const endpoint = trunk
      ? `PJSIP/${request.to}@${trunk}`
      : `PJSIP/${request.to}`;

    const params = new URLSearchParams({
      endpoint,
      app: appName,
      // Correlate back to the MontrAI session via channel variable + appArgs.
      appArgs: request.callSessionId,
      callerId: request.from,
    });
    if (request.options?.timeoutSec != null) {
      params.set('timeout', String(request.options.timeoutSec));
    }

    const response = await safeOutboundFetch(
      `${ariUrl(baseUrl, 'channels')}?${params.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: basicAuthHeader(username, password) },
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`ARI originate failed: ${response.status} ${text}`);
    }

    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      state?: string;
    };
    if (!json.id) {
      throw new Error('ARI originate response missing channel id');
    }

    return {
      providerCallId: json.id,
      status: normalizeState(json.state) ?? 'initiated',
      startedAt: new Date(),
    };
  }

  async hangup(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { baseUrl, username, password } = decodeAsteriskCredential(credential);
    await safeOutboundFetch(
      ariUrl(baseUrl, `channels/${encodeURIComponent(providerCallId)}`),
      {
        method: 'DELETE',
        headers: { Authorization: basicAuthHeader(username, password) },
      },
    );
  }

  async sendDTMF(
    request: VoiceSendDtmfRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { baseUrl, username, password } = decodeAsteriskCredential(credential);
    const params = new URLSearchParams({ dtmf: request.digits });
    await safeOutboundFetch(
      `${ariUrl(baseUrl, `channels/${encodeURIComponent(request.providerCallId)}/dtmf`)}?${params.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: basicAuthHeader(username, password) },
      },
    );
  }

  async playAudio(
    request: VoicePlayAudioRequest,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { baseUrl, username, password } = decodeAsteriskCredential(credential);
    // ARI `play` takes a media URI. External http(s) media is referenced as
    // `sound:` or a direct URI depending on Asterisk config; we pass the URL via
    // the `media` query param. Looping is approximated by repeated play calls;
    // here we issue one play (loop handled by the worker if > 1).
    const params = new URLSearchParams({ media: request.audioUrl });
    await safeOutboundFetch(
      `${ariUrl(baseUrl, `channels/${encodeURIComponent(request.providerCallId)}/play`)}?${params.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: basicAuthHeader(username, password) },
      },
    );
  }

  async transferCall(
    request: VoiceTransferRequest,
    credential: VoiceProviderCredential,
  ): Promise<VoiceTransferResult> {
    const { baseUrl, username, password, appName } =
      decodeAsteriskCredential(credential);
    const trunk = typeof credential.metadata?.trunk === 'string'
      ? credential.metadata.trunk
      : undefined;
    const targetEndpoint = trunk
      ? `PJSIP/${request.to}@${trunk}`
      : `PJSIP/${request.to}`;

    try {
      if (request.mode === 'warm') {
        // Warm: create a mixing bridge, originate the target leg into the app,
        // and add both channels to the bridge. We create the bridge + target
        // here; the worker adds channels once the target answers (Stasis event).
        const bridgeRes = await safeOutboundFetch(
          `${ariUrl(baseUrl, 'bridges')}?type=mixing`,
          {
            method: 'POST',
            headers: { Authorization: basicAuthHeader(username, password) },
          },
        );
        if (!bridgeRes.ok) {
          const text = await bridgeRes.text().catch(() => '');
          return { status: 'failed', reason: `bridge create: ${bridgeRes.status} ${text}` };
        }
        const bridge = (await bridgeRes.json().catch(() => ({}))) as { id?: string };

        const originateParams = new URLSearchParams({
          endpoint: targetEndpoint,
          app: appName,
          appArgs: `transfer:${request.providerCallId}`,
        });
        const targetRes = await safeOutboundFetch(
          `${ariUrl(baseUrl, 'channels')}?${originateParams.toString()}`,
          {
            method: 'POST',
            headers: { Authorization: basicAuthHeader(username, password) },
          },
        );
        if (!targetRes.ok) {
          const text = await targetRes.text().catch(() => '');
          return { status: 'failed', reason: `target originate: ${targetRes.status} ${text}` };
        }
        const target = (await targetRes.json().catch(() => ({}))) as { id?: string };

        // Add the existing caller leg to the bridge immediately; the worker adds
        // the target on StasisStart.
        if (bridge.id) {
          const addParams = new URLSearchParams({ channel: request.providerCallId });
          await safeOutboundFetch(
            `${ariUrl(baseUrl, `bridges/${encodeURIComponent(bridge.id)}/addChannel`)}?${addParams.toString()}`,
            {
              method: 'POST',
              headers: { Authorization: basicAuthHeader(username, password) },
            },
          );
        }
        return { status: 'bridged', transferCallId: target.id };
      }

      // Cold: redirect the existing channel to the target endpoint via /redirect.
      const params = new URLSearchParams({ endpoint: targetEndpoint });
      const res = await safeOutboundFetch(
        `${ariUrl(baseUrl, `channels/${encodeURIComponent(request.providerCallId)}/redirect`)}?${params.toString()}`,
        {
          method: 'POST',
          headers: { Authorization: basicAuthHeader(username, password) },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { status: 'failed', reason: `${res.status} ${text}` };
      }
      return { status: 'initiated' };
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
    const { baseUrl, username, password } = decodeAsteriskCredential(credential);
    // ARI records via the channel `record` action; the recording is named and
    // that name is the handle used to stop it.
    const recordingName = `montrai-${providerCallId}-${Date.now()}`;
    const params = new URLSearchParams({
      name: recordingName,
      format: 'wav',
    });
    await safeOutboundFetch(
      `${ariUrl(baseUrl, `channels/${encodeURIComponent(providerCallId)}/record`)}?${params.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: basicAuthHeader(username, password) },
      },
    );
    return { recordingSid: recordingName };
  }

  async stopRecording(
    _providerCallId: string,
    recordingSid: string,
    credential: VoiceProviderCredential,
  ): Promise<void> {
    const { baseUrl, username, password } = decodeAsteriskCredential(credential);
    // Recordings are stopped by name under /recordings/live/{name}/stop.
    await safeOutboundFetch(
      ariUrl(baseUrl, `recordings/live/${encodeURIComponent(recordingSid)}/stop`),
      {
        method: 'POST',
        headers: { Authorization: basicAuthHeader(username, password) },
      },
    );
  }

  async getCallStatus(
    providerCallId: string,
    credential: VoiceProviderCredential,
  ): Promise<VoiceCallStatusSnapshot> {
    const { baseUrl, username, password } = decodeAsteriskCredential(credential);
    const response = await safeOutboundFetch(
      ariUrl(baseUrl, `channels/${encodeURIComponent(providerCallId)}`),
      {
        method: 'GET',
        headers: { Authorization: basicAuthHeader(username, password) },
      },
    );

    if (!response.ok) {
      // 404 means the channel is gone (call ended) — treat as completed.
      return {
        providerCallId,
        status: response.status === 404 ? 'completed' : 'failed',
        recordingUrl: null,
        endedAt: response.status === 404 ? new Date() : null,
        endReason: null,
      };
    }

    const json = (await response.json().catch(() => ({}))) as {
      state?: string;
      creationtime?: string;
    };

    return {
      providerCallId,
      status: normalizeState(json.state),
      recordingUrl: null,
      endedAt: null,
      endReason: null,
    };
  }

  verifyWebhookSignature(
    payload: VoiceInboundWebhookPayload,
    credential: VoiceProviderCredential,
  ): VoiceWebhookVerification {
    // ARI has no signed-webhook scheme — it pushes events over an authenticated
    // WebSocket. If an event is ever forwarded to us as an HTTP POST (e.g. a
    // bridging proxy), we authenticate it with a shared secret configured in
    // metadata.webhookSecret, compared against the Basic creds / bearer in the
    // payload. Absent the secret, we cannot verify → fail closed.
    const secret = typeof credential.metadata?.webhookSecret === 'string'
      ? credential.metadata.webhookSecret
      : undefined;

    if (!secret) {
      return { valid: false, reason: 'no webhookSecret configured for ARI proxy' };
    }

    const presented = payload.signature
      ?? payload.headers['authorization']
      ?? payload.headers['Authorization']
      ?? payload.headers['x-ari-secret']
      ?? payload.headers['X-Ari-Secret'];

    if (!presented) {
      return { valid: false, reason: 'missing shared-secret header' };
    }

    // Accept either the raw secret or a `Basic base64(user:secret)` form whose
    // password equals the secret.
    let candidate = presented.trim();
    if (candidate.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = Buffer.from(candidate.slice(6).trim(), 'base64').toString('utf8');
        candidate = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded;
      } catch {
        return { valid: false, reason: 'malformed Basic credential' };
      }
    }

    return candidate === secret
      ? { valid: true }
      : { valid: false, reason: 'shared-secret mismatch' };
  }

  async handleInboundWebhook(
    payload: VoiceInboundWebhookPayload,
  ): Promise<VoiceEvent[]> {
    // ARI delivers events over a WebSocket events stream (consumed by the
    // worker's WS subscription in Phase 8), NOT as webhook POSTs. This method
    // exists to satisfy the interface. If a proxy forwards an ARI event JSON to
    // us as a POST body, we normalize the common channel events; otherwise we
    // return [].
    let evt: {
      type?: string;
      channel?: { id?: string; state?: string };
      cause?: number;
      cause_txt?: string;
      digit?: string;
      recording?: { name?: string; target_uri?: string; format?: string };
      duration?: number;
    };
    try {
      evt = JSON.parse(payload.rawBody);
    } catch {
      // Not a JSON ARI event (e.g. empty WS-only deployment) — nothing to do.
      return [];
    }

    const providerCallId = evt.channel?.id;
    if (!evt.type || !providerCallId) return [];

    const at = new Date();
    const events: VoiceEvent[] = [];

    switch (evt.type) {
      case 'StasisStart':
      case 'ChannelCreated':
        events.push({ type: 'call.initiated', providerCallId, at });
        break;
      case 'ChannelStateChange': {
        const state = evt.channel?.state;
        if (state === 'Ringing' || state === 'Ring') {
          events.push({ type: 'call.ringing', providerCallId, at });
        } else if (state === 'Up') {
          events.push({ type: 'call.answered', providerCallId, at });
        }
        break;
      }
      case 'ChannelDtmfReceived':
        if (evt.digit) {
          events.push({ type: 'dtmf.received', providerCallId, at, digits: evt.digit });
        }
        break;
      case 'RecordingFinished':
        if (evt.recording?.target_uri || evt.recording?.name) {
          events.push({
            type: 'recording.available',
            providerCallId,
            at,
            recordingUrl: evt.recording.target_uri ?? evt.recording.name ?? '',
            mimeType: evt.recording.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
          });
        }
        break;
      case 'StasisEnd':
      case 'ChannelDestroyed': {
        // cause 16 = normal clearing; others indicate failure.
        if (typeof evt.cause === 'number' && evt.cause !== 16 && evt.cause !== 0) {
          events.push({
            type: 'call.failed',
            providerCallId,
            at,
            errorCode: String(evt.cause),
            errorMessage: evt.cause_txt ?? `hangup cause ${evt.cause}`,
          });
        } else {
          events.push({
            type: 'call.completed',
            providerCallId,
            at,
            durationSec: typeof evt.duration === 'number' ? evt.duration : 0,
            endReason: evt.cause_txt ?? undefined,
          });
        }
        break;
      }
      default:
        break;
    }

    return events;
  }
}

export const asteriskAriProvider = new AsteriskAriProvider();
registerVoiceProvider(asteriskAriProvider);
