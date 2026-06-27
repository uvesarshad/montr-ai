/**
 * BullMQ queue for workflow executions.
 *
 * The job contract is intentionally minimal — we serialize only the
 * `ExecutionConfig` fields needed to boot the engine. The worker re-loads
 * the workflow by id, so state stays canonical in Mongo.
 *
 * When Redis is not configured (`isQueueConfigured() === false`), `enqueue`
 * runs the engine inline — same behavior as before. This keeps local dev
 * friction-free.
 */

import { Queue, QueueEvents, JobsOptions, ConnectionOptions } from 'bullmq';
import { getRedisConnection, isQueueConfigured } from './connection';
import {
  getOrgQueueLimits,
  effectivePriority,
  reserveQueuedSlot,
  releaseQueuedSlot,
} from './fairness';

export { QueueDepthExceededError } from './fairness';
export { ExecutionQuotaExceededError, QuotaCheckUnavailableError } from '@/lib/plan-enforcement';

export const EXECUTION_QUEUE_NAME = 'workflow-executions';

export interface ExecutionJobPayload {
  workflowId: string;
  userId: string;
  triggerData?: Record<string, unknown>;
  initialVariables?: Record<string, unknown>;
  contactId?: string;
  dealId?: string;
  campaignId?: string;
  /** Pre-created execution record id (optional — worker creates one otherwise). */
  executionId?: string;
  /** Where the run came from: manual | schedule | webhook | trigger-<name> */
  source?: string;
  /** 1.9 test loop: honor node pinnedData + seed trigger from pin. Manual/test only. */
  testMode?: boolean;
  /** 1.9 dry-run: side-effecting nodes simulate instead of firing. */
  dryRun?: boolean;
  /** Idempotency token for deduplication at enqueue time. */
  idempotencyKey?: string;
  /**
   * Resume-from-delay payload. When present, the worker treats this job as a
   * continuation: rehydrate the given executionId and continue execution from
   * `resume.fromNodeIds` instead of starting a new run. Used by the persistent
   * delay node (N-E2) to survive worker restarts across long wait windows.
   */
  resume?: {
    fromNodeIds: string[];
    delayNodeId?: string;
  };
}

let cachedQueue: Queue | null | undefined;

export function getExecutionQueue(): Queue | null {
  if (cachedQueue !== undefined) return cachedQueue;
  const connection = getRedisConnection();
  if (!connection) {
    cachedQueue = null;
    return null;
  }
  cachedQueue = new Queue(EXECUTION_QUEUE_NAME, {
    // BullMQ accepts an ioredis client as connection at runtime; its types model
    // this as `ConnectionOptions | IORedis`, but the union in @types/bullmq isn't
    // always up to date. Cast to any here — cleanest place for the boundary.
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: {
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
      attempts: 1, // workflow engine has its own retry semantics — don't double-retry
    },
  });
  return cachedQueue;
}

let cachedEvents: QueueEvents | null | undefined;
export function getExecutionQueueEvents(): QueueEvents | null {
  if (cachedEvents !== undefined) return cachedEvents;
  const connection = getRedisConnection();
  if (!connection) {
    cachedEvents = null;
    return null;
  }
  cachedEvents = new QueueEvents(EXECUTION_QUEUE_NAME, { connection: connection as unknown as ConnectionOptions });
  return cachedEvents;
}

/**
 * Enqueue a workflow execution. Returns a job descriptor the caller can use
 * to track progress. When Redis isn't configured, falls through to inline
 * execution and returns a synthetic descriptor.
 */
export async function enqueueExecution(
  payload: ExecutionJobPayload,
  opts?: JobsOptions
): Promise<{ jobId: string; queued: boolean; executionId?: string }> {
  // Monthly execution-quota gate on EVERY entry path (audit H18). Resume jobs
  // (delay-resume / channel-message-resume / sweeper-resume / resume-user) are
  // exempt — they continue a run that was already counted when it started, so
  // they carry `payload.resume`. Only NEW executions are gated here.
  if (!payload.resume) {
    const { canExecuteWorkflowForOrg, ExecutionQuotaExceededError } = await import('@/lib/plan-enforcement');
    // Throws QuotaCheckUnavailableError on DB error → callers fail CLOSED.
    const quota = await canExecuteWorkflowForOrg(payload.userId);
    if (!quota.allowed && quota.limit > 0) {
      throw new ExecutionQuotaExceededError(payload.userId, quota.current, quota.limit);
    }
  }

  if (!isQueueConfigured()) {
    const { runInline } = await import('./inline-runner');
    const result = await runInline(payload);
    return { jobId: `inline:${result.executionId}`, queued: false, executionId: result.executionId };
  }
  const queue = getExecutionQueue()!;
  const jobOpts: JobsOptions = { ...opts };
  if (payload.idempotencyKey) jobOpts.jobId = payload.idempotencyKey;

  // Per-org queue fairness (audit C1). Priority lane (lower = served first) is
  // plan-driven; bulk/trigger fan-out is de-prioritized so interactive runs jump
  // ahead. Caller-supplied `opts.priority` wins if provided.
  const limits = await getOrgQueueLimits(payload.userId);
  if (jobOpts.priority === undefined) {
    const pri = effectivePriority(limits.priority, payload.source);
    if (pri > 0) jobOpts.priority = pri;
  }

  // Per-org queued-depth cap. Reserve a slot first; if the org is over its plan
  // cap this throws QueueDepthExceededError, which dispatch/route callers catch
  // and skip (rather than crashing the webhook/trigger path).
  await reserveQueuedSlot(payload.userId);
  try {
    const job = await queue.add('execute', payload, jobOpts);
    return { jobId: String(job.id), queued: true, executionId: payload.executionId };
  } catch (err) {
    // Enqueue failed — give the reserved depth slot back so we don't leak it.
    await releaseQueuedSlot(payload.userId).catch(() => { /* best-effort */ });
    throw err;
  }
}

/**
 * Wait for an enqueued job to finish. Useful for sync-ish API callers that
 * want request-response semantics. Resolves with the worker's return value.
 */
export async function waitForJob(jobId: string, timeoutMs = 60_000): Promise<unknown> {
  const events = getExecutionQueueEvents();
  const queue = getExecutionQueue();
  if (!events || !queue) throw new Error('Queue not configured — cannot wait for job');
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  return job.waitUntilFinished(events, timeoutMs);
}
