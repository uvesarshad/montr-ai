/**
 * Distributed single-leader lock for singleton maintenance jobs.
 *
 * The pattern: a periodic job (sweeper, pruner, …) is registered as a BullMQ
 * repeatable so a single tick fires across all worker instances — but the *job
 * body* may still run on more than one instance if multiple consumers pick up
 * the same tick, and some jobs are expensive / state-mutating. This util wraps
 * the body in a Redis `SET key token NX PX` lock so exactly one instance runs
 * it per tick; the others no-op.
 *
 * Shared by `execution-sweeper.ts` and `execution-pruner.ts` (previously each
 * had a hand-rolled copy of this exact acquire/compare-and-delete dance).
 *
 * Degradation: when Redis isn't configured (single-process dev), the work runs
 * directly with no lock — there is only one runner anyway.
 */

import { getRedisConnection } from './connection';

/**
 * Compare-and-delete: release the lock only if we still hold this token. Avoids
 * a slow holder deleting a lock a faster instance has since re-acquired.
 */
const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * Run `fn` under a distributed Redis lock keyed by `lockKey`.
 *
 * - Acquires `SET lockKey token NX PX ttlMs`. If another instance holds it,
 *   returns `null` without running `fn`.
 * - When Redis is unavailable, runs `fn` directly (single-process fallback).
 * - Always releases the lock (compare-and-delete) in a `finally`.
 *
 * Keep `ttlMs` longer than the worst-case run time of `fn` but shorter than the
 * cron interval, so a crashed holder's lock expires before the next tick.
 */
export async function withRedisLock<T>(
  lockKey: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const redis = getRedisConnection();
  if (!redis) {
    // No Redis → single-process dev; just run it directly.
    return fn();
  }

  const token = `${process.pid}:${Date.now()}`;
  // SET key token NX PX ttl — acquire only if absent.
  const acquired = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') {
    return null; // Another instance holds the lock this tick.
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
    } catch (err) {
      console.error(`[redis-lock] release failed for ${lockKey}:`, err);
    }
  }
}
