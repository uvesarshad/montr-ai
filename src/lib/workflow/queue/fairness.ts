/**
 * Per-org queue fairness for the workflow-executions queue (audit C1).
 *
 * Problem: one global queue + one flat-concurrency worker means a single org's
 * webhook/trigger storm fills every worker slot and starves all other tenants
 * (FIFO, no priority, and most enqueue paths bypass the 30/org/min rate limit).
 *
 * Fix (all plan-field driven — no hardcoded business limits):
 *   1. Per-org in-flight cap   — `org:inflight:<orgId>` counter, gated at job start
 *      against the org plan's `maxConcurrentExecutions`.
 *   2. Per-org queued-depth cap — `org:queued:<orgId>` counter, gated at enqueue
 *      time against `maxQueuedExecutions`.
 *   3. Priority lanes          — BullMQ `priority` derived from the plan's
 *      `executionPriority` (+ an offset for bulk/fan-out runs).
 *
 * Counters live in Redis so they're shared across web processes and the worker.
 * Each carries a TTL so a crashed worker can't leak a slot forever — the worker
 * refreshes the TTL via the increment, and the counter self-heals on expiry.
 */

import type { Redis } from 'ioredis';
import { getRedisConnection } from './connection';
import { getOrgPlanFeatures } from '@/lib/plan-enforcement';

/** Safety TTL (seconds) on the in-flight counter — far longer than any sane single run. */
const INFLIGHT_TTL_SECONDS = 15 * 60;
/** TTL on the queued-depth counter — generous; decremented on dequeue/complete. */
const QUEUED_TTL_SECONDS = 24 * 60 * 60;

/** Bulk/fan-out runs get this added to the plan priority so interactive runs jump ahead. */
export const BULK_PRIORITY_OFFSET = 10;

/** Sources considered "bulk / fan-out" (lower-urgency lane). */
const BULK_SOURCE_PREFIXES = ['trigger-', 'schedule', 'rerun', 'bulk'];

function inflightKey(orgId: string): string {
  return `wf:org:inflight:${orgId}`;
}
function queuedKey(orgId: string): string {
  return `wf:org:queued:${orgId}`;
}

// ── Plan-limit cache ────────────────────────────────────────────────────────
// Avoid a DB hit on every enqueue/job. Short TTL so super-admin plan edits take
// effect quickly without a restart.
interface QueueLimits {
  maxConcurrent: number; // -1 = unlimited
  maxQueued: number;     // -1 = unlimited
  priority: number;      // base BullMQ priority (lower = higher)
}
const PLAN_CACHE_TTL_MS = 60_000;
const planCache = new Map<string, { limits: QueueLimits; expires: number }>();

export async function getOrgQueueLimits(organizationId: string): Promise<QueueLimits> {
  const now = Date.now();
  const cached = planCache.get(organizationId);
  if (cached && cached.expires > now) return cached.limits;

  const features = await getOrgPlanFeatures(organizationId);
  // Conservative fallbacks ONLY when the plan predates these fields: treat a
  // missing value as generous/unlimited so we never break existing tenants.
  const limits: QueueLimits = {
    maxConcurrent: features.maxConcurrentExecutions ?? -1,
    maxQueued: features.maxQueuedExecutions ?? -1,
    priority: features.executionPriority ?? 0,
  };
  planCache.set(organizationId, { limits, expires: now + PLAN_CACHE_TTL_MS });
  return limits;
}

/** Compute the effective BullMQ priority for a run. Lower = served first. */
export function effectivePriority(basePriority: number, source?: string): number {
  if (basePriority <= 0) {
    // 0 means "no priority" (FIFO) for interactive; still de-prioritize bulk.
    return isBulkSource(source) ? BULK_PRIORITY_OFFSET : 0;
  }
  return isBulkSource(source) ? basePriority + BULK_PRIORITY_OFFSET : basePriority;
}

function isBulkSource(source?: string): boolean {
  if (!source) return false;
  return BULK_SOURCE_PREFIXES.some((p) => source.startsWith(p));
}

// ── Queued-depth cap (enqueue side) ─────────────────────────────────────────

export class QueueDepthExceededError extends Error {
  constructor(public organizationId: string, public limit: number, public current: number) {
    super(
      `Org ${organizationId} exceeded its queued-execution cap (${current}/${limit}). ` +
        `Job rejected to protect queue fairness.`
    );
    this.name = 'QueueDepthExceededError';
  }
}

/**
 * Reserve a queued slot for an org at enqueue time. Throws
 * `QueueDepthExceededError` if the org is already at/over its plan cap.
 * Caller MUST `releaseQueuedSlot` when the job leaves the waiting state
 * (i.e. when the worker picks it up) and on enqueue failure.
 */
export async function reserveQueuedSlot(organizationId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return; // inline mode — no queue, nothing to cap
  const limits = await getOrgQueueLimits(organizationId);
  if (limits.maxQueued === -1) {
    await bumpQueued(redis, organizationId);
    return;
  }
  const key = queuedKey(organizationId);
  const next = await redis.incr(key);
  await redis.expire(key, QUEUED_TTL_SECONDS);
  if (next > limits.maxQueued) {
    // Roll back our reservation, then reject.
    await redis.decr(key);
    throw new QueueDepthExceededError(organizationId, limits.maxQueued, next - 1);
  }
}

async function bumpQueued(redis: Redis, organizationId: string): Promise<void> {
  const key = queuedKey(organizationId);
  await redis.incr(key);
  await redis.expire(key, QUEUED_TTL_SECONDS);
}

/** Release a queued slot (job dequeued by worker, or enqueue failed). Floors at 0. */
export async function releaseQueuedSlot(organizationId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  const key = queuedKey(organizationId);
  const next = await redis.decr(key);
  if (next < 0) await redis.set(key, '0');
}

// ── In-flight cap (worker side) ─────────────────────────────────────────────

/**
 * Try to claim an in-flight slot for an org. Returns true if claimed (caller may
 * proceed), false if the org is already at its `maxConcurrentExecutions` cap and
 * the job should be deferred. On true, the caller MUST `releaseInflightSlot` in a
 * finally block.
 */
export async function tryClaimInflightSlot(organizationId: string): Promise<boolean> {
  const redis = getRedisConnection();
  if (!redis) return true; // inline mode
  const limits = await getOrgQueueLimits(organizationId);
  if (limits.maxConcurrent === -1) {
    await touchInflight(redis, organizationId);
    return true;
  }
  const key = inflightKey(organizationId);
  const next = await redis.incr(key);
  await redis.expire(key, INFLIGHT_TTL_SECONDS); // refresh safety TTL on every claim
  if (next > limits.maxConcurrent) {
    await redis.decr(key);
    return false;
  }
  return true;
}

async function touchInflight(redis: Redis, organizationId: string): Promise<void> {
  const key = inflightKey(organizationId);
  await redis.incr(key);
  await redis.expire(key, INFLIGHT_TTL_SECONDS);
}

/** Release an in-flight slot. Floors at 0. */
export async function releaseInflightSlot(organizationId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  const key = inflightKey(organizationId);
  const next = await redis.decr(key);
  if (next < 0) await redis.set(key, '0');
}
