/**
 * Crash / stall reconciler (audit finding C2).
 *
 * Nothing in the system reaps executions that get stuck:
 *   - The engine sets a run RUNNING at create and only flips it to a terminal
 *     status inside its own try/catch. If the worker process crashes (OOM,
 *     SIGKILL, deploy) mid-run, the record stays RUNNING forever.
 *   - The BullMQ worker (`worker.ts`) catches engine errors and *returns*
 *     (never throws) with `attempts: 1`, so BullMQ can't re-drive a failed job.
 *   - PAUSED runs depend on a delayed BullMQ job (delay node) or an event
 *     resume. If Redis is flushed / evicts the delayed job, the run stays
 *     PAUSED past its resume time with nothing to wake it.
 *
 * This sweeper runs on a 5-minute cron in the worker process and reconciles
 * both cases against Mongo (the source of truth):
 *
 *   1. Stalled RUNNING runs — `startedAt` older than the workflow timeout
 *      (default 300s) + a grace margin AND no step logged inside that window
 *      → mark FAILED (`worker_crashed_or_timed_out`) + fire the existing
 *      `workflow.execution_failed` notification path.
 *
 *   2. Overdue PAUSED runs — `context.resumePointer.resumeAt` (delay node) or
 *      `context.pausedForEvent.deadline` (wait-for-event node) in the past
 *      → re-enqueue the resume job through the normal resume path. A
 *      deterministic jobId collapses duplicates so a re-enqueue is a no-op if
 *      the original delayed job is still alive.
 *
 * A Redis `SET NX PX` lock guards the whole sweep so only one worker instance
 * runs it per tick in a multi-worker deployment.
 */

import type { Job } from 'bullmq';
import { Queue, Worker, ConnectionOptions } from 'bullmq';
import { getRedisConnection, isQueueConfigured } from './connection';
import { withRedisLock } from './redis-lock';
import { enqueueExecution } from './execution-queue';

export const SWEEPER_QUEUE_NAME = 'workflow-sweeper';
const SWEEP_JOB_NAME = 'sweep-stalled';
const SWEEP_REPEAT_JOB_ID = 'workflow-sweeper-cron';

/** Distributed lock so only one worker instance sweeps per tick. */
const SWEEP_LOCK_KEY = 'workflow:sweeper:lock';
const SWEEP_LOCK_TTL_MS = 4 * 60 * 1000; // 4 min — shorter than the 5-min cron.

/**
 * Grace margin added on top of the workflow timeout before we consider a
 * RUNNING execution stalled. Covers clock skew + the gap between the engine's
 * own timeout check and the terminal write.
 */
const STALL_GRACE_MS = 60 * 1000; // 1 min
/** Fallback timeout when a workflow doc has no explicit `timeout` (seconds). */
const DEFAULT_TIMEOUT_SEC = 300;
/** Cap how many docs we touch per sweep so a backlog can't blow up one tick. */
const SWEEP_BATCH_LIMIT = 500;

export interface SweepReport {
  scanned: number;
  failedStalled: number;
  resumedPaused: number;
  errors: number;
}

/**
 * Reconcile stalled RUNNING and overdue PAUSED executions. Idempotent and
 * safe to run concurrently with live executions — it only acts on records
 * whose own timing proves they are stuck.
 */
export async function sweepStalledExecutions(): Promise<SweepReport> {
  const report: SweepReport = { scanned: 0, failedStalled: 0, resumedPaused: 0, errors: 0 };

  // Lazy import to keep this module light when the worker isn't running it.
  const { connectMongoose } = await import('@/lib/mongodb');
  await connectMongoose();

  const { ExecutionStatus } = await import('@/lib/db/models/unified-workflow.model');
  const { default: UnifiedWorkflowExecution } = await import(
    '@/lib/db/models/unified-workflow-execution.model'
  );

  const now = Date.now();

  // ── 1. Stalled RUNNING executions ──────────────────────────────────────
  //
  // We can't pre-filter on the per-workflow timeout in one query (it varies by
  // workflow), so we use the most lenient possible cutoff — DEFAULT_TIMEOUT +
  // grace — to bound the candidate set, then apply the real per-workflow
  // timeout in memory. `executionPath` is excluded from the projection; we only
  // need the timestamp of the last step, which we read via `currentStep` and a
  // sliced lookup.
  const runningCutoff = new Date(now - (DEFAULT_TIMEOUT_SEC * 1000 + STALL_GRACE_MS));
  const runningCandidates = await UnifiedWorkflowExecution.find({
    status: ExecutionStatus.RUNNING,
    startedAt: { $lte: runningCutoff },
  })
    .select('_id workflowId workflowName organizationId userId startedAt currentNodeId')
    .sort({ startedAt: 1 })
    .limit(SWEEP_BATCH_LIMIT)
    .lean()
    .exec();

  const { UnifiedWorkflow } = await import('@/lib/db/models/unified-workflow.model');

  for (const exec of runningCandidates) {
    report.scanned++;
    try {
      // Resolve the workflow's configured timeout (default 300s).
      const wf = await UnifiedWorkflow.findById(exec.workflowId)
        .select('timeout name')
        .lean()
        .exec();
      const timeoutSec = (wf?.timeout as number | undefined) ?? DEFAULT_TIMEOUT_SEC;
      const stallWindowMs = timeoutSec * 1000 + STALL_GRACE_MS;

      // Last activity = the most recent of startedAt and the last step timestamp.
      // Read only the last step rather than the whole executionPath payload.
      const lastStepDoc = await UnifiedWorkflowExecution.findById(exec._id)
        .select({ executionPath: { $slice: -1 }, startedAt: 1 })
        .lean()
        .exec();
      const lastStep = (lastStepDoc?.executionPath as Array<{ timestamp?: Date; nodeId?: string }> | undefined)?.[0];
      const lastActivity = Math.max(
        new Date(exec.startedAt).getTime(),
        lastStep?.timestamp ? new Date(lastStep.timestamp).getTime() : 0,
      );

      if (now - lastActivity < stallWindowMs) {
        // Still within its window — a long-but-healthy run. Skip.
        continue;
      }

      const errorNodeId = exec.currentNodeId || lastStep?.nodeId;

      // Atomically claim the transition so a racing engine write or a second
      // sweeper instance can't double-fail it.
      const res = await UnifiedWorkflowExecution.updateOne(
        { _id: exec._id, status: ExecutionStatus.RUNNING },
        {
          $set: {
            status: ExecutionStatus.FAILED,
            error: 'worker_crashed_or_timed_out',
            completedAt: new Date(),
            ...(errorNodeId ? { errorNodeId } : {}),
          },
        },
      );
      if (res.modifiedCount === 0) continue; // someone else finalized it.

      report.failedStalled++;
      await emitExecutionFailedNotification({
        workflowId: String(exec.workflowId),
        executionId: String(exec._id),
        workflowName: exec.workflowName || wf?.name || 'Workflow',
        userId: String(exec.userId),
        error: 'worker_crashed_or_timed_out',
      });
    } catch (err) {
      report.errors++;
      console.error(
        `[execution-sweeper] Failed to reconcile stalled execution ${exec._id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── 2. Overdue PAUSED executions ───────────────────────────────────────
  //
  // Either a delay-node pause (resumePointer.resumeAt) or a wait-for-event
  // pause (pausedForEvent.deadline) whose wake time is in the past. The queued
  // resume job is just an optimization; DB is the source of truth, so we
  // re-enqueue with a deterministic jobId — if the original delayed job still
  // exists, BullMQ collapses the duplicate.
  const nowDate = new Date(now);
  const pausedCandidates = await UnifiedWorkflowExecution.find({
    status: ExecutionStatus.PAUSED,
    $or: [
      { 'context.resumePointer.resumeAt': { $lte: nowDate } },
      { 'context.pausedForEvent.deadline': { $lte: nowDate } },
    ],
  })
    .select('_id workflowId organizationId userId contactId dealId campaignId triggerData context')
    .limit(SWEEP_BATCH_LIMIT)
    .lean()
    .exec();

  for (const exec of pausedCandidates) {
    report.scanned++;
    try {
      const ctx = (exec.context || {}) as {
        resumePointer?: { delayNodeId?: string; nextNodeIds?: string[]; resumeAt?: Date };
        pausedForEvent?: { waitNodeId?: string; nextNodeIds?: string[]; deadline?: Date };
      };

      // Prefer the delay pointer; fall back to the event deadline.
      const pointer = ctx.resumePointer;
      const eventSpec = ctx.pausedForEvent;

      let fromNodeIds: string[] | undefined;
      let delayNodeId: string | undefined;
      let resumeAt: Date | undefined;

      if (pointer?.resumeAt && new Date(pointer.resumeAt).getTime() <= now) {
        fromNodeIds = pointer.nextNodeIds;
        delayNodeId = pointer.delayNodeId;
        resumeAt = new Date(pointer.resumeAt);
      } else if (eventSpec?.deadline && new Date(eventSpec.deadline).getTime() <= now) {
        fromNodeIds = eventSpec.nextNodeIds;
        delayNodeId = eventSpec.waitNodeId;
        resumeAt = new Date(eventSpec.deadline);
      }

      if (!fromNodeIds || fromNodeIds.length === 0) {
        // Nothing actionable (malformed pointer). Leave for inspection.
        continue;
      }

      const executionId = String(exec._id);
      // Deterministic jobId so a still-live delayed job collapses the duplicate.
      const idempotencyKey = `resume:${executionId}:${resumeAt!.getTime()}`;

      await enqueueExecution({
        workflowId: String(exec.workflowId),
        userId: String(exec.userId),
        contactId: exec.contactId ? String(exec.contactId) : undefined,
        dealId: exec.dealId ? String(exec.dealId) : undefined,
        campaignId: exec.campaignId ? String(exec.campaignId) : undefined,
        executionId,
        triggerData: (exec.triggerData ?? {}) as Record<string, unknown>,
        source: 'sweeper-resume',
        idempotencyKey,
        resume: { fromNodeIds, delayNodeId },
      });

      report.resumedPaused++;
    } catch (err) {
      report.errors++;
      console.error(
        `[execution-sweeper] Failed to re-enqueue paused execution ${exec._id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (report.failedStalled > 0 || report.resumedPaused > 0 || report.errors > 0) {
    console.log(
      `[execution-sweeper] Sweep complete — scanned=${report.scanned} failedStalled=${report.failedStalled} resumedPaused=${report.resumedPaused} errors=${report.errors}`,
    );
  }
  return report;
}

/**
 * Fire the same `workflow.execution_failed` domain event the engine emits, so
 * the notification dispatcher alerts the run's owner. Reuses the exact event
 * shape from `unified-execution-engine.ts#emitExecutionFailed`.
 */
async function emitExecutionFailedNotification(input: {
  workflowId: string;
  executionId: string;
  workflowName: string;
  userId: string;
  error: string;
}): Promise<void> {
  try {
    const { publishDomainEvent } = await import('@/lib/events/domain-bus');
    publishDomainEvent({
      type: 'workflow.execution_failed',
      source: 'engine',
      payload: {
        workflowId: input.workflowId,
        executionId: input.executionId,
        workflowName: input.workflowName,
        userId: input.userId,
        error: input.error,
      },
    });
  } catch (err) {
    console.error('[execution-sweeper] failed to publish workflow.execution_failed:', err);
  }
}

/**
 * Run the sweep under a distributed Redis lock so only one worker instance
 * acts per tick. Returns null if the lock wasn't acquired (another worker is
 * sweeping) or Redis isn't configured.
 */
export async function sweepStalledExecutionsLocked(): Promise<SweepReport | null> {
  return withRedisLock(SWEEP_LOCK_KEY, SWEEP_LOCK_TTL_MS, sweepStalledExecutions);
}

// ── BullMQ cron registration + consumer ──────────────────────────────────

let cachedSweeperQueue: Queue | null | undefined;

function getSweeperQueue(): Queue | null {
  if (cachedSweeperQueue !== undefined) return cachedSweeperQueue;
  const connection = getRedisConnection();
  if (!connection) {
    cachedSweeperQueue = null;
    return null;
  }
  cachedSweeperQueue = new Queue(SWEEPER_QUEUE_NAME, {
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 24 * 3600, count: 100 },
      removeOnFail: { age: 7 * 24 * 3600, count: 200 },
    },
  });
  return cachedSweeperQueue;
}

/**
 * Register the 5-minute sweeper cron. Idempotent (fixed repeat jobId).
 * No-op when Redis isn't configured.
 */
export async function scheduleExecutionSweeper(): Promise<void> {
  if (!isQueueConfigured()) {
    console.warn('[execution-sweeper] Redis not configured — sweeper cron skipped.');
    return;
  }
  const queue = getSweeperQueue();
  if (!queue) return;
  await queue.add(
    SWEEP_JOB_NAME,
    { trigger: 'cron' },
    {
      repeat: { pattern: '*/5 * * * *' }, // Every 5 minutes
      jobId: SWEEP_REPEAT_JOB_ID,
    },
  );
  console.log('[execution-sweeper] Sweeper cron registered (every 5 min).');
}

let cachedSweeperWorker: Worker | null = null;

/** Start the consumer that runs the sweep when the cron fires. */
export function createExecutionSweeperWorker(): Worker | null {
  if (cachedSweeperWorker) return cachedSweeperWorker;
  const connection = getRedisConnection();
  if (!connection) return null;

  cachedSweeperWorker = new Worker(
    SWEEPER_QUEUE_NAME,
    async (_job: Job) => {
      const result = await sweepStalledExecutionsLocked();
      return result ?? { skipped: 'lock-held' };
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1,
    },
  );

  cachedSweeperWorker.on('failed', (job, err) => {
    console.error(`[execution-sweeper] Sweep job ${job?.id} failed:`, err?.message || err);
  });
  cachedSweeperWorker.on('error', (err) => {
    console.error('[execution-sweeper] Worker error:', err?.message || err);
  });

  return cachedSweeperWorker;
}
