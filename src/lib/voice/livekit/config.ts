/**
 * LiveKit media-plane config (Phase 8 — media-plane foundation).
 *
 * Resolves LiveKit server credentials from env and exposes a lazy, null-safe
 * `RoomServiceClient` factory. EVERYTHING here is null-safe: when the LiveKit
 * env is absent (the common case on this machine — there is no LiveKit server
 * running yet) `isLiveKitConfigured()` returns false and the factory returns
 * `null`, so callers (routes/helpers) can degrade to a clear 501 / no-op rather
 * than throwing at import time.
 *
 * Env contract:
 *   LIVEKIT_URL        wss://… or https://…  (the SFU / media server URL)
 *   LIVEKIT_API_KEY    API key   (project credential — server-side only)
 *   LIVEKIT_API_SECRET API secret (server-side only — NEVER ships to client)
 *
 * Multi-tenancy note: LiveKit credentials are PROJECT-level (one MontrAI
 * deployment → one LiveKit project). Per-tenant isolation is NOT done with
 * separate keys — it is enforced at the `room = tenant boundary` + JWT
 * `VideoGrant` layer (see `token.ts` / `rooms.ts`). The key/secret here only
 * mint tokens and administer rooms; the grant scopes WHAT a participant may do.
 */

import { RoomServiceClient } from 'livekit-server-sdk';

export interface LiveKitConfig {
  /** Media server URL (wss:// for clients, https:// host used for the REST admin client). */
  url: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Read + validate the LiveKit env. Returns `null` when any of URL / key /
 * secret is missing — callers must treat null as "LiveKit not configured".
 */
export function getLiveKitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/** True when LiveKit env is fully present. Cheap — call freely in route guards. */
export function isLiveKitConfigured(): boolean {
  return getLiveKitConfig() !== null;
}

/**
 * The browser-facing media URL (what `livekit-client` connects to). This is the
 * only LiveKit value safe to return to a client — the api key/secret never are.
 */
export function getLiveKitClientUrl(): string | null {
  return getLiveKitConfig()?.url ?? null;
}

/**
 * The `RoomServiceClient` wants an HTTP(S) host, not a `wss://` URL. Normalize
 * `wss://`→`https://` and `ws://`→`http://` so the same env var works for both
 * the client (websocket) and the REST admin client.
 */
function toHttpUrl(url: string): string {
  if (url.startsWith('wss://')) return 'https://' + url.slice('wss://'.length);
  if (url.startsWith('ws://')) return 'http://' + url.slice('ws://'.length);
  return url;
}

let cachedRoomService: RoomServiceClient | null | undefined;

/**
 * Lazy, cached `RoomServiceClient` factory. Returns `null` when LiveKit isn't
 * configured. Used by `rooms.ts` to create/list/delete rooms via the server API.
 */
export function getRoomServiceClient(): RoomServiceClient | null {
  if (cachedRoomService !== undefined) return cachedRoomService;
  const cfg = getLiveKitConfig();
  if (!cfg) {
    cachedRoomService = null;
    return null;
  }
  cachedRoomService = new RoomServiceClient(
    toHttpUrl(cfg.url),
    cfg.apiKey,
    cfg.apiSecret,
  );
  return cachedRoomService;
}
