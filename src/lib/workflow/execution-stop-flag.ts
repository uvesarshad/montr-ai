/**
 * Cross-process execution stop flag (audit H13).
 *
 * The engine's in-memory `AbortController` registry only reaches runs in the
 * SAME process. A run picked up by the BullMQ worker lives in a different
 * process from the Next.js HTTP server that handles the stop request, so the
 * in-process `cancel()` is a no-op there.
 *
 * This module bridges that gap with a tiny Redis flag the stop endpoint SETs
 * and the engine GETs at every per-node boundary (mirrors how pause/cancel is
 * meant to propagate cross-process). The check is one cheap Redis GET per node;
 * when Redis is not configured the helpers are no-ops (dev inline path already
 * gets the in-process AbortController, so nothing is lost).
 *
 * Key shape: `wf:stop:<executionId>` → "1", TTL-bounded so a missed clear can't
 * leak forever.
 */

import { getRedisConnection } from './queue/connection';

const STOP_KEY_PREFIX = 'wf:stop:';
// A stopped run finishes within seconds; the flag only needs to outlive the
// gap between SET and the engine's next node-boundary read. 1h is generous and
// self-cleans if the run was already gone.
const STOP_FLAG_TTL_SECONDS = 60 * 60;

function stopKey(executionId: string): string {
  return `${STOP_KEY_PREFIX}${executionId}`;
}

/**
 * Mark an execution to stop. Called by the stop endpoint so a worker-side run
 * notices at its next checkpoint. Returns true when the flag was written.
 */
export async function requestExecutionStop(executionId: string): Promise<boolean> {
  const redis = getRedisConnection();
  if (!redis) return false;
  try {
    await redis.set(stopKey(executionId), '1', 'EX', STOP_FLAG_TTL_SECONDS);
    return true;
  } catch (err) {
    console.error('[execution-stop-flag] set failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Cheap per-node-boundary check. Returns true when a stop has been requested.
 * Swallows Redis errors (returns false) — a transient Redis blip must never
 * spuriously kill a healthy run.
 */
export async function isExecutionStopRequested(executionId: string): Promise<boolean> {
  const redis = getRedisConnection();
  if (!redis) return false;
  try {
    const v = await redis.get(stopKey(executionId));
    return v === '1';
  } catch {
    return false;
  }
}

/** Clear the flag once the run has finalized (best-effort). */
export async function clearExecutionStop(executionId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    await redis.del(stopKey(executionId));
  } catch {
    /* non-fatal */
  }
}
