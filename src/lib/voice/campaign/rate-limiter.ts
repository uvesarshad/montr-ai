/**
 * Campaign rate limiter (Phase 4).
 *
 * Redis sliding-window rate limiter keyed PER ORG + per batch. Modelled on
 * dograh's CampaignOrchestrator RateLimiter: each `tryAcquire` enforces TWO
 * gates atomically via a single Lua script —
 *   1. a per-second sliding window (≤ `perSecond` acquisitions in the last 1s), and
 *   2. a concurrent-slot cap (≤ `concurrentSlots` outstanding in-flight calls).
 *
 * A slot is acquired when a call leaves the queue to be placed and released once
 * the call leaves 'placing' (in_progress / failed / terminal). The concurrent
 * gate is a ZSET of slot ids scored by acquire-time so stale slots (a worker that
 * died mid-call) expire after `slotTtlMs` instead of leaking capacity forever.
 *
 * 🔒 Every Redis key carries `organizationId` AND `batchId` — no cross-tenant
 * bleed. Null-safe: when Redis is absent every method degrades to "deny" for
 * acquire (false) and "no-op" for release, so the caller never dials without a
 * working limiter.
 */

import { getRedisConnection } from '@/lib/workflow/queue/connection';

const KEY_PREFIX = 'voice:campaign:ratelimit';

/** Window for the per-second gate, in milliseconds. */
const SECOND_WINDOW_MS = 1_000;

/**
 * How long a concurrent slot may live before it is considered abandoned and
 * swept by the next acquire. Generous — a real outbound call rarely sits in
 * 'placing' for more than a few seconds, but a crashed worker must not pin a
 * slot forever. Override per-call if needed.
 */
const DEFAULT_SLOT_TTL_MS = 120_000;

function secondKey(orgId: string, batchId: string): string {
  return `${KEY_PREFIX}:sec:${orgId}:${batchId}`;
}

function slotsKey(orgId: string, batchId: string): string {
  return `${KEY_PREFIX}:slots:${orgId}:${batchId}`;
}

/**
 * Atomic acquire of one rate-limit slot.
 *
 * KEYS[1] = per-second window ZSET
 * KEYS[2] = concurrent-slot ZSET
 * ARGV[1] = now (ms)
 * ARGV[2] = perSecond limit
 * ARGV[3] = concurrentSlots limit
 * ARGV[4] = slotTtlMs
 * ARGV[5] = slotId (unique token for this acquisition)
 *
 * Returns 1 when both gates pass (and the slot is recorded), 0 otherwise.
 */
const ACQUIRE_LUA = `
local secKey = KEYS[1]
local slotKey = KEYS[2]
local now = tonumber(ARGV[1])
local perSecond = tonumber(ARGV[2])
local concurrent = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local slotId = ARGV[5]

-- Evict expired members from both windows first.
redis.call('ZREMRANGEBYSCORE', secKey, 0, now - ${SECOND_WINDOW_MS})
redis.call('ZREMRANGEBYSCORE', slotKey, 0, now - ttl)

-- Gate 1: per-second sliding window.
if perSecond > 0 then
  local recent = redis.call('ZCARD', secKey)
  if recent >= perSecond then
    return 0
  end
end

-- Gate 2: concurrent slots.
if concurrent > 0 then
  local inflight = redis.call('ZCARD', slotKey)
  if inflight >= concurrent then
    return 0
  end
end

-- Both gates pass — record the acquisition in both windows.
redis.call('ZADD', secKey, now, slotId)
redis.call('ZADD', slotKey, now, slotId)
-- Keep keys from lingering once a batch goes quiet.
redis.call('PEXPIRE', secKey, ${SECOND_WINDOW_MS} * 2)
redis.call('PEXPIRE', slotKey, ttl + 5000)
return 1
`;

export interface AcquireResult {
  acquired: boolean;
  /** Opaque token to pass back to `release()` when the call leaves 'placing'. */
  slotId: string | null;
}

/**
 * Try to acquire one dial slot for `orgId`/`batchId`. Passing both the
 * per-second and concurrent gates returns `{ acquired: true, slotId }`. The
 * caller MUST `release()` the returned `slotId` once the call leaves 'placing'.
 *
 * @param perSecond       max acquisitions in any rolling 1s window (0 = unlimited)
 * @param concurrentSlots max outstanding in-flight calls (0 = unlimited)
 */
export async function tryAcquire(
  orgId: string,
  batchId: string,
  perSecond: number,
  concurrentSlots: number,
  slotTtlMs: number = DEFAULT_SLOT_TTL_MS,
): Promise<AcquireResult> {
  const redis = getRedisConnection();
  if (!redis) {
    // Fail closed — never dial without a working limiter.
    return { acquired: false, slotId: null };
  }

  const slotId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const res = (await redis.eval(
      ACQUIRE_LUA,
      2,
      secondKey(orgId, batchId),
      slotsKey(orgId, batchId),
      String(Date.now()),
      String(perSecond),
      String(concurrentSlots),
      String(slotTtlMs),
      slotId,
    )) as number;
    return res === 1 ? { acquired: true, slotId } : { acquired: false, slotId: null };
  } catch (err) {
    console.error('[voice-campaign:rate-limiter] acquire failed:', err);
    return { acquired: false, slotId: null };
  }
}

/**
 * Release a concurrent slot taken by `tryAcquire`. Idempotent — releasing an
 * unknown/expired slot is a no-op. Does NOT touch the per-second window (that
 * one self-expires after 1s and reflects dial-rate, not in-flight count).
 */
export async function release(orgId: string, batchId: string, slotId: string | null): Promise<void> {
  if (!slotId) return;
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    await redis.zrem(slotsKey(orgId, batchId), slotId);
  } catch (err) {
    console.error('[voice-campaign:rate-limiter] release failed:', err);
  }
}

/**
 * Current count of in-flight concurrent slots (after evicting expired ones).
 * Useful for the orchestrator to size the next burst. Returns 0 when Redis is
 * absent.
 */
export async function inflightSlots(orgId: string, batchId: string, slotTtlMs: number = DEFAULT_SLOT_TTL_MS): Promise<number> {
  const redis = getRedisConnection();
  if (!redis) return 0;
  try {
    const key = slotsKey(orgId, batchId);
    await redis.zremrangebyscore(key, 0, Date.now() - slotTtlMs);
    return await redis.zcard(key);
  } catch {
    return 0;
  }
}

/** Drop all rate-limit state for a batch (called on terminal transitions). */
export async function clear(orgId: string, batchId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    await redis.del(secondKey(orgId, batchId), slotsKey(orgId, batchId));
  } catch {
    /* best-effort */
  }
}

export const RATE_LIMITER_DEFAULTS = {
  SECOND_WINDOW_MS,
  DEFAULT_SLOT_TTL_MS,
};
