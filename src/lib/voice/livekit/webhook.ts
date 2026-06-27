/**
 * LiveKit webhook verification + normalization (Phase 8 — media-plane foundation).
 *
 * LiveKit POSTs server-side events (room_started, participant_joined, …) to a
 * configured webhook URL, signed with the project API key/secret as a JWT in the
 * `Authorization` header. `WebhookReceiver.receive()` verifies that signature
 * AND parses the body — we then normalize the subset of events we care about
 * into a small typed shape.
 *
 * This module ONLY verifies + types events. It is deliberately NOT wired into
 * the conversation engine (the route logs/broadcasts; engine coupling is the
 * bridge's job — see `bridge.ts`). Null-safe: returns `{ ok: false }` when
 * LiveKit isn't configured rather than throwing.
 */

import { WebhookReceiver } from 'livekit-server-sdk';

import { getLiveKitConfig } from './config';
import { callIdFromRoomName } from './rooms';
import type { ParticipantTenantMetadata } from './token';

/** The LiveKit webhook event types we normalize (others are passed through as `other`). */
export type LiveKitEventKind =
  | 'room_started'
  | 'room_finished'
  | 'participant_joined'
  | 'participant_left'
  | 'track_published'
  | 'track_unpublished'
  | 'other';

/**
 * Normalized LiveKit webhook event. Tenancy (`organizationId`/`brandId`) is
 * recovered from the participant metadata we stamped at token-mint time, and
 * `callSessionId` is recovered from the deterministic room name — so we never
 * trust a client-supplied field to map an event back to a tenant.
 */
export interface NormalizedLiveKitEvent {
  kind: LiveKitEventKind;
  /** Raw LiveKit event string (in case we add handling later). */
  rawEvent: string;
  roomName?: string;
  /** Recovered from the room name (`montrai-call-<id>`), when ours. */
  callSessionId?: string | null;
  /** Participant identity, for participant_* events. */
  participantIdentity?: string;
  /** Tenancy recovered from participant metadata, when present + parseable. */
  tenant?: ParticipantTenantMetadata | null;
  /** Event timestamp (ms epoch) as reported by LiveKit, if present. */
  createdAtMs?: number;
}

export interface WebhookResult {
  ok: boolean;
  /** Reason on failure (debug only — do not surface to clients). */
  reason?: string;
  event?: NormalizedLiveKitEvent;
}

let cachedReceiver: WebhookReceiver | null | undefined;

function getReceiver(): WebhookReceiver | null {
  if (cachedReceiver !== undefined) return cachedReceiver;
  const cfg = getLiveKitConfig();
  cachedReceiver = cfg ? new WebhookReceiver(cfg.apiKey, cfg.apiSecret) : null;
  return cachedReceiver;
}

function parseTenant(metadata?: string): ParticipantTenantMetadata | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as Partial<ParticipantTenantMetadata>;
    if (typeof parsed.organizationId === 'string' && typeof parsed.callSessionId === 'string') {
      return {
        brandId: typeof parsed.brandId === 'string' ? parsed.brandId : null,
        callSessionId: parsed.callSessionId,
      };
    }
  } catch {
    /* not JSON / not ours */
  }
  return null;
}

function toKind(raw: string): LiveKitEventKind {
  switch (raw) {
    case 'room_started':
    case 'room_finished':
    case 'participant_joined':
    case 'participant_left':
    case 'track_published':
    case 'track_unpublished':
      return raw;
    default:
      return 'other';
  }
}

/**
 * Verify + normalize a LiveKit webhook.
 *
 * @param body       the RAW request body string (must be the exact bytes — do
 *                   not re-stringify a parsed object; the signature covers raw).
 * @param authHeader the `Authorization` header value LiveKit sent.
 */
export async function verifyLiveKitWebhook(
  body: string,
  authHeader: string | null | undefined,
): Promise<WebhookResult> {
  const receiver = getReceiver();
  if (!receiver) return { ok: false, reason: 'livekit-not-configured' };
  if (!authHeader) return { ok: false, reason: 'missing-authorization-header' };

  try {
    // `receive(body, authHeader)` verifies the JWT signature over `body`.
    const ev = await receiver.receive(body, authHeader);
    const roomName = ev.room?.name;
    const normalized: NormalizedLiveKitEvent = {
      kind: toKind(ev.event),
      rawEvent: ev.event,
      roomName,
      callSessionId: roomName ? callIdFromRoomName(roomName) : null,
      participantIdentity: ev.participant?.identity,
      tenant: parseTenant(ev.participant?.metadata ?? ev.room?.metadata),
      createdAtMs: ev.createdAt ? Number(ev.createdAt) * 1000 : undefined,
    };
    return { ok: true, event: normalized };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'verification-failed',
    };
  }
}
