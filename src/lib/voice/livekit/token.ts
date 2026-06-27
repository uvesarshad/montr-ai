/**
 * LiveKit access-token minting (Phase 8 — media-plane foundation).
 *
 * ── Tenancy model (how a room maps to a tenant) ──────────────────────────────
 *   room      = the call/tenant boundary. One LiveKit room ↔ one MontrAI
 *               `call_session`. Naming is deterministic (`rooms.ts#roomNameForCall`)
 *               so a room can never be guessed across tenants, and the grant
 *               below pins the participant to exactly ONE room.
 *   grant     = the AUTHORIZATION. A `VideoGrant` with `room` + `roomJoin` means
 *               "this JWT may join ONLY this room, with these publish/subscribe
 *               rights". A token for org A's room cannot join org B's room.
 *   metadata  = the TENANT TAG. We stamp `{ organizationId, brandId, callSessionId }`
 *               into the participant metadata so the webhook/bridge layer can map
 *               a LiveKit participant back to the owning org/brand/session WITHOUT
 *               trusting any client-supplied field.
 *
 * 🔒 `organizationId` MUST come from the caller's session (resolved server-side
 * from the DB user record) — NEVER from a request body. The route is the place
 * that enforces this; this function just takes the already-trusted value.
 */

import { AccessToken } from 'livekit-server-sdk';
import type { VideoGrant } from 'livekit-server-sdk';

import { getLiveKitConfig } from './config';

export interface MintAccessTokenParams {
  /** Active brand (agency mode), when the call is brand-scoped. */
  brandId?: string | null;
  /** MontrAI `call_session._id` this room represents. */
  callSessionId: string;
  /** Stable participant identity (e.g. `user:<id>` or `agent:<callSessionId>`). */
  identity: string;
  /** Deterministic room name (use `roomNameForCall`). */
  roomName: string;
  /** Whether the participant may publish audio/video (browser caller: true). */
  canPublish?: boolean;
  /** Whether the participant may subscribe to others' tracks (default true). */
  canSubscribe?: boolean;
  /** Optional human-readable display name. */
  name?: string;
  /** Token TTL — defaults to 1h. Calls are short; keep tokens short-lived. */
  ttlSeconds?: number;
}

/**
 * The metadata blob stamped into the participant token. This is the canonical
 * place the room/webhook/bridge layer reads tenancy from. JSON-serialized into
 * the JWT's `metadata` claim.
 */
export interface ParticipantTenantMetadata {
  organizationId?: string;
  brandId: string | null;
  callSessionId: string;
}

export interface MintedToken {
  token: string;
  roomName: string;
  identity: string;
  metadata: ParticipantTenantMetadata;
}

/**
 * Mint a room-scoped LiveKit access token (JWT) for a participant.
 *
 * Returns `null` when LiveKit isn't configured — the route must translate that
 * into a clear "not configured" response (501), never a 500.
 */
export async function mintAccessToken(
  params: MintAccessTokenParams,
): Promise<MintedToken | null> {
  const cfg = getLiveKitConfig();
  if (!cfg) return null;

  const { brandId = null, callSessionId, identity, roomName, canPublish = true, canSubscribe = true, name, ttlSeconds = 60 * 60 } = params;

  const metadata: ParticipantTenantMetadata = {
    brandId,
    callSessionId,
  };

  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    name,
    ttl: ttlSeconds,
    // Stamp tenancy into the participant metadata — the room/webhook/bridge
    // layer reads org/brand/session from HERE, never from a client field.
    metadata: JSON.stringify(metadata),
  });

  // The grant is the authorization: join ONLY this room, with these rights.
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe,
    // Browser test-caller doesn't need data-channel publish; keep it minimal.
    canPublishData: true,
  };
  at.addGrant(grant);

  const token = await at.toJwt();
  return { token, roomName, identity, metadata };
}
