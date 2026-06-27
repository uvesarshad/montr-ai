/**
 * Voice call dispatcher — admission control + enqueue.
 *
 * This is the seam between "a call needs handling" (inbound webhook, outbound
 * dialer, bulk campaign) and "a worker drives the media". Instead of any HTTP
 * route owning a media WebSocket in-process, those paths build a `CallJob` and
 * call `enqueueCall` here. The dispatcher:
 *
 *   1. Validates org-scoping (🔒 every job MUST carry an organizationId read
 *      from the session user's DB record — never client input).
 *   2. Enforces a per-org concurrency cap at admission (the voice analog of the
 *      workflow fairness in `src/lib/workflow/queue/fairness.ts`): one tenant's
 *      call storm cannot consume the whole worker fleet.
 *   3. Enqueues onto the shared `voice-call` BullMQ queue.
 *
 * When Redis is absent the queue is unavailable; we surface that to the caller
 * (`queued: false`) so it can fall back to an in-process bridge in dev.
 */

import type { Redis } from 'ioredis';
import { getRedisConnection } from '@/lib/workflow/queue/connection';
import { addCallJob, isCallQueueConfigured, type CallJob } from './call-queue';

/**
 * Per-org admission cap on CONCURRENTLY dispatched calls. Plan-driven limits
 * land in Phase 9; until then this is an env-tunable safety cap so no single
 * tenant can monopolize the fleet. `-1` (or `0`) disables the cap.
 */
const ORG_CALL_CAP = (() => {
  const raw = Number(process.env.VOICE_ORG_CONCURRENT_CALL_CAP ?? 50);
  return Number.isFinite(raw) ? raw : 50;
})();

/** Safety TTL on the per-org admission counter — far longer than any call. */
const ORG_CALL_TTL_SECONDS = 2 * 60 * 60;

function orgCallsKey(organizationId: string): string {
  return `voice:org:calls:${organizationId}`;
}

/** Thrown when an org is at its concurrent-call admission cap. */
export class CallConcurrencyExceededError extends Error {
  constructor(public organizationId: string, public limit: number, public current: number) {
    super(
      `Org ${organizationId} is at its concurrent-call cap (${current}/${limit}). ` +
        `Call dispatch rejected to protect fleet fairness.`,
    );
    this.name = 'CallConcurrencyExceededError';
  }
}

/** Thrown when a CallJob fails org-scoping validation. */
export class CallScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CallScopeError';
  }
}

function isHex24(s: string): boolean {
  return /^[a-f0-9]{24}$/i.test(s);
}

/**
 * Reserve an admission slot for an org. Throws `CallConcurrencyExceededError`
 * if the org is at/over its cap. The slot is RELEASED by the worker when the
 * call completes (or by a reaper via TTL if the worker dies). No-op sans Redis.
 */
async function reserveOrgCallSlot(redis: Redis, organizationId: string): Promise<void> {
  if (ORG_CALL_CAP <= 0) return; // cap disabled
  const key = orgCallsKey(organizationId);
  // INCR + EXPIRE atomically so a crash between them can't leave a counter with
  // no TTL (which would phantom-occupy a slot forever). Lua runs both as one op.
  const next = (await redis.eval(
    'local n = redis.call("INCR", KEYS[1]); redis.call("EXPIRE", KEYS[1], ARGV[1]); return n',
    1,
    key,
    String(ORG_CALL_TTL_SECONDS),
  )) as number;
  if (next > ORG_CALL_CAP) {
    await redis.decr(key);
    throw new CallConcurrencyExceededError(organizationId, ORG_CALL_CAP, next - 1);
  }
}

/**
 * Release an org admission slot. Called by the worker when a call finishes.
 * Floors at 0 so a double-release can't drive the counter negative. No-op sans
 * Redis.
 */
export async function releaseOrgCallSlot(organizationId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  if (ORG_CALL_CAP <= 0) return;
  const key = orgCallsKey(organizationId);
  const next = await redis.decr(key);
  if (next < 0) await redis.set(key, '0');
}

export interface EnqueueCallResult {
  /** BullMQ job id, or null when Redis isn't configured. */
  jobId: string | null;
  /** True when the job was actually queued (false → caller handles inline). */
  queued: boolean;
}

/**
 * Validate + admission-control + enqueue a call. This is the public entrypoint
 * inbound-webhook / outbound-dialer / bulk-campaign paths call.
 *
 * @throws CallScopeError on bad org-scoping
 * @throws CallConcurrencyExceededError when the org is at its cap
 */
export async function enqueueCall(job: CallJob): Promise<EnqueueCallResult> {
  // ── 🔒 Org-scoping validation ─────────────────────────────────────────────
  if (typeof job.organizationId !== 'string') {
    throw new CallScopeError('CallJob.organizationId is required (read it from the session user, not client input).');
  }
  if (!job.callSessionId || !isHex24(job.callSessionId)) {
    throw new CallScopeError('CallJob.callSessionId must be a 24-hex call_session id.');
  }
  if (!job.providerId) {
    throw new CallScopeError('CallJob.providerId is required.');
  }

  // No Redis → no queue. Tell the caller so it can run an in-process bridge.
  if (!isCallQueueConfigured()) {
    return { jobId: null, queued: false };
  }
  const redis = getRedisConnection();
  if (!redis) return { jobId: null, queued: false };

  // ── Per-org admission cap ──────────────────────────────────────────────────
  await reserveOrgCallSlot(redis, job.organizationId);
  try {
    // Idempotency: one job per call_session. A provider re-POST (webhook
    // retry) for the same session must not spawn a second media bridge.
    const jobId = await addCallJob(job, { jobId: `voice-call:${job.callSessionId}` });
    if (jobId === null) {
      // Queue vanished between the config check and add — release + bail.
      await releaseOrgCallSlot(job.organizationId).catch(() => { /* best-effort */ });
      return { jobId: null, queued: false };
    }
    return { jobId, queued: true };
  } catch (err) {
    // Enqueue failed — give the reserved admission slot back so we don't leak.
    await releaseOrgCallSlot(job.organizationId).catch(() => { /* best-effort */ });
    throw err;
  }
}
