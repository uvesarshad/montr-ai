/**
 * BullMQ queue for live voice-call dispatch.
 *
 * Mirrors `src/lib/workflow/queue/execution-queue.ts`: a cached, null-safe
 * singleton built on the SHARED `getRedisConnection()` client. When Redis is
 * not configured the queue helpers return `null` and callers fall back to an
 * in-process media bridge (dev ergonomics — same pattern as inline workflow
 * execution).
 *
 * The job contract is deliberately minimal: we serialize only the correlation
 * ids needed to (re)hydrate the call. The worker re-loads the canonical
 * `call_session` from Mongo by id, so live call state stays canonical in the DB
 * — the queue is a dumb pipe carrying "go drive this call" hand-offs.
 */

import { Queue, QueueEvents, JobsOptions, ConnectionOptions } from 'bullmq';
import { getRedisConnection, isQueueConfigured } from '@/lib/workflow/queue/connection';
import type {
  VoiceCallDirection,
  VoiceEngineMode,
  VoiceProviderId,
} from '@/lib/voice/types';

export const VOICE_CALL_QUEUE_NAME = 'voice-call';

/** BullMQ job name for a "drive this live call" hand-off. */
export const VOICE_CALL_JOB_NAME = 'drive-call';

/**
 * Payload for a single dispatched call. Carries only correlation ids + the
 * decisions made at admission; the worker re-loads the `call_session` for the
 * authoritative call state.
 *
 * 🔒 `organizationId` is mandatory and is the per-tenant scope for every Redis
 * key, fairness claim, and DB read the worker performs. It is read from the
 * session user's DB record at the dispatch call-site — NEVER client-supplied.
 */
export interface CallJob {
  /** MontrAI `call_session._id` (24-hex). Canonical correlation id. */
  callSessionId: string;
  /** Owning organization. Tenant scope for all keys/claims/queries. */
  organizationId: string;
  /** Active brand (agency mode), when the call is brand-scoped. */
  brandId?: string;
  /** Selected provider id (twilio/plivo/…) decided at admission. */
  providerId: VoiceProviderId;
  /** Which conversation engine drives the call (cascaded vs realtime). */
  engine: VoiceEngineMode;
  /** Call direction relative to MontrAI. */
  direction: VoiceCallDirection;
  /**
   * Opaque per-call hints lifted onto the job at dispatch time (aiBotId,
   * aiCharacterId, script override, etc.). The worker merges these into the
   * session's customMetadata view — keep it small + JSON-serializable.
   */
  sessionMeta?: Record<string, unknown>;
}

let cachedQueue: Queue<CallJob> | null | undefined;

/**
 * Get the shared voice-call queue, or `null` when Redis is not configured.
 * Cached singleton — safe to call on every dispatch.
 */
export function getCallQueue(): Queue<CallJob> | null {
  if (cachedQueue !== undefined) return cachedQueue;
  const connection = getRedisConnection();
  if (!connection) {
    cachedQueue = null;
    return null;
  }
  cachedQueue = new Queue<CallJob>(VOICE_CALL_QUEUE_NAME, {
    // ioredis client passed directly; BullMQ's @types union lags the runtime.
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: {
      // Calls are short-lived; keep recent history for ops, prune aggressively.
      removeOnComplete: { age: 6 * 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600, count: 2000 },
      // The media bridge owns its own lifecycle/recovery; don't double-retry a
      // call — a failed leg is dead, the provider re-dials if it wants to.
      attempts: 1,
    },
  });
  return cachedQueue;
}

let cachedEvents: QueueEvents | null | undefined;

/** QueueEvents for the voice-call queue (used by sync-ish waiters), or null. */
export function getCallQueueEvents(): QueueEvents | null {
  if (cachedEvents !== undefined) return cachedEvents;
  const connection = getRedisConnection();
  if (!connection) {
    cachedEvents = null;
    return null;
  }
  cachedEvents = new QueueEvents(VOICE_CALL_QUEUE_NAME, {
    connection: connection as unknown as ConnectionOptions,
  });
  return cachedEvents;
}

/** True when Redis backs the voice-call queue (delegates to the shared check). */
export function isCallQueueConfigured(): boolean {
  return isQueueConfigured();
}

/**
 * Low-level enqueue. Most callers should use `enqueueCall` in `dispatcher.ts`,
 * which layers org-scoping validation + per-org admission control on top.
 *
 * Returns the job id, or `null` when Redis isn't configured (caller falls back
 * to an in-process bridge).
 */
export async function addCallJob(
  job: CallJob,
  opts?: JobsOptions,
): Promise<string | null> {
  const queue = getCallQueue();
  if (!queue) return null;
  const added = await queue.add(VOICE_CALL_JOB_NAME, job, opts);
  return String(added.id);
}
