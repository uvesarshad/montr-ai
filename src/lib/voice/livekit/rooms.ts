/**
 * LiveKit room helpers (Phase 8 — media-plane foundation).
 *
 * A LiveKit room IS the call/tenant boundary: one room ↔ one MontrAI
 * `call_session`. Room names are deterministic + namespaced so they can't
 * collide or be guessed across tenants. All admin ops go through the lazy
 * `RoomServiceClient` and are null-safe — when LiveKit isn't configured they
 * no-op (create/ensure → null, list → [], delete → false).
 *
 * Note: a room name does NOT by itself authorize anything — the JWT
 * `VideoGrant` (see `token.ts`) is what scopes a participant to a room.
 */

import type { Room } from 'livekit-server-sdk';

import { getRoomServiceClient } from './config';

/** Prefix every MontrAI room so it's distinguishable in the LiveKit dashboard. */
const ROOM_PREFIX = 'montrai-call-';

/**
 * Deterministic room name for a call session. One call session ↔ one room.
 * `callSessionId` is a 24-hex Mongo id, so the name is stable + unguessable.
 */
export function roomNameForCall(callSessionId: string): string {
  return `${ROOM_PREFIX}${callSessionId}`;
}

/** Inverse of `roomNameForCall` — extract the callSessionId, or null if not ours. */
export function callIdFromRoomName(roomName: string): string | null {
  if (!roomName.startsWith(ROOM_PREFIX)) return null;
  const id = roomName.slice(ROOM_PREFIX.length);
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}

export interface EnsureRoomOptions {
  /** Auto-close the room this many seconds after the last participant leaves. */
  emptyTimeoutSec?: number;
  /** Max participants — a 1:1 call is 2 (caller + agent). */
  maxParticipants?: number;
  /** Optional metadata JSON stamped onto the room (org/brand tags). */
  metadata?: string;
}

/**
 * Create a room. Returns the created `Room`, or `null` when LiveKit isn't
 * configured. Throws only on a genuine API error (caller may catch).
 */
export async function createRoom(
  roomName: string,
  opts: EnsureRoomOptions = {},
): Promise<Room | null> {
  const svc = getRoomServiceClient();
  if (!svc) return null;
  return svc.createRoom({
    name: roomName,
    emptyTimeout: opts.emptyTimeoutSec ?? 5 * 60,
    maxParticipants: opts.maxParticipants ?? 2,
    metadata: opts.metadata,
  });
}

/**
 * Ensure a room exists (idempotent). LiveKit auto-creates a room on first join
 * when a valid token is presented, so explicit creation is optional — but
 * pre-creating lets us pin `emptyTimeout`/`maxParticipants`/metadata. Returns
 * the room, or `null` when LiveKit isn't configured. Swallows "already exists".
 */
export async function ensureRoom(
  roomName: string,
  opts: EnsureRoomOptions = {},
): Promise<Room | null> {
  const svc = getRoomServiceClient();
  if (!svc) return null;
  try {
    return await createRoom(roomName, opts);
  } catch {
    // Room likely already exists (or a transient race) — fetch the existing one.
    const existing = await listRooms([roomName]);
    return existing[0] ?? null;
  }
}

/**
 * List rooms (optionally filtered to specific names). Returns `[]` when LiveKit
 * isn't configured.
 */
export async function listRooms(names?: string[]): Promise<Room[]> {
  const svc = getRoomServiceClient();
  if (!svc) return [];
  return svc.listRooms(names);
}

/**
 * Delete a room (ends the call for everyone in it). Returns `true` on success,
 * `false` when LiveKit isn't configured or the delete fails.
 */
export async function deleteRoom(roomName: string): Promise<boolean> {
  const svc = getRoomServiceClient();
  if (!svc) return false;
  try {
    await svc.deleteRoom(roomName);
    return true;
  } catch {
    return false;
  }
}
