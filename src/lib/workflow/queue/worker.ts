/**
 * BullMQ worker for the workflow-executions queue.
 *
 * Start it with `node --loader ts-node/esm scripts/workflow-worker.ts` (or
 * equivalent) in a separate process. Running it inside the Next.js dev server
 * is possible but not recommended — long-running workers compete with the HTTP
 * loop and restart on every hot-reload.
 *
 * Each job boots an engine instance, runs one workflow execution, and returns
 * the terminal status. Per-job failures are captured in the execution record
 * itself, so we return rather than throw — the queue shouldn't double-retry.
 */

import { Worker, Job, ConnectionOptions, DelayedError } from 'bullmq';
import { getRedisConnection } from './connection';
import { EXECUTION_QUEUE_NAME, ExecutionJobPayload } from './execution-queue';
import { UnifiedWorkflowExecutionEngine } from '../unified-execution-engine';
import {
  tryClaimInflightSlot,
  releaseInflightSlot,
  releaseQueuedSlot,
} from './fairness';

/**
 * How long to defer a job when its org is at its per-org concurrency cap. Short
 * enough to stay responsive, long enough to avoid a tight re-check loop.
 */
const CONCURRENCY_DEFER_MS = 10_000;

export interface WorkerJobResult {
  executionId: string;
  status: string;
  error?: string;
}

async function processJob(job: Job<ExecutionJobPayload>, token?: string): Promise<WorkerJobResult> {
  const payload = job.data;
  const mode = payload.resume ? 'resume' : 'execute';

  // This job is leaving the waiting state — release its reserved queued-depth
  // slot (taken at enqueue time). Whether it runs now or gets deferred below, it
  // is no longer "waiting" against the org's queued cap.
  await releaseQueuedSlot(payload.userId).catch(() => { /* best-effort */ });

  // Per-org concurrency cap (audit C1). Claim an in-flight slot; if the org is
  // already at its plan's `maxConcurrentExecutions`, defer this job instead of
  // burning a worker slot — this is what stops one org's storm from starving
  // every other tenant. We use BullMQ v5's moveToDelayed + DelayedError so the
  // job goes back to the delayed set and is retried by the scheduler.
  const claimed = await tryClaimInflightSlot(payload.userId);
  if (!claimed) {
    console.log(
      `[workflow-worker] Org ${payload.userId} at concurrency cap — deferring job ${job.id} by ${CONCURRENCY_DEFER_MS}ms`
    );
    // moveToDelayed requires the worker token; if it's somehow missing, fall
    // through and run (fail-open) rather than throwing an unhandled error.
    if (token) {
      await job.moveToDelayed(Date.now() + CONCURRENCY_DEFER_MS, token);
      throw new DelayedError(); // signals BullMQ the job was intentionally delayed
    }
  }

  console.log(
    `[workflow-worker] Processing job ${job.id} (${mode}) — workflow=${payload.workflowId} org=${payload.userId} source=${payload.source || 'unknown'}`
  );

  const engine = new UnifiedWorkflowExecutionEngine();
  try {
    let execution;
    if (payload.resume && payload.executionId) {
      execution = await engine.resume({
        executionId: payload.executionId,
        fromNodeIds: payload.resume.fromNodeIds,
      });
    } else {
      execution = await engine.execute({
        workflowId: payload.workflowId,
        userId: payload.userId,
        contactId: payload.contactId,
        dealId: payload.dealId,
        campaignId: payload.campaignId,
        triggerData: payload.triggerData ?? {},
        initialVariables: payload.initialVariables,
        testMode: payload.testMode,
        dryRun: payload.dryRun,
      });
    }
    return {
      executionId: execution._id.toString(),
      status: execution.status,
      error: execution.error,
    };
  } catch (err: unknown) {
    // Engine errors are already logged + persisted on the execution record.
    // Return a result shape rather than throwing so BullMQ doesn't retry — the
    // unified engine has its own per-node retry semantics (errorHandling.maxRetries).
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[workflow-worker] Job ${job.id} failed:`, errMsg);
    return {
      executionId: payload.executionId || 'unknown',
      status: 'failed',
      error: errMsg,
    };
  } finally {
    // Always free the org's in-flight slot once the run completes/fails so the
    // per-org concurrency cap self-heals. (The deferred-job path above returns
    // before claiming, so this only runs for jobs that actually ran.)
    await releaseInflightSlot(payload.userId).catch(() => { /* best-effort */ });
  }
}

let cachedWorker: Worker<ExecutionJobPayload, WorkerJobResult> | null = null;

/**
 * Create and start the worker. Safe to call multiple times — returns the
 * same instance. Returns null if Redis isn't configured (which means the
 * worker wasn't supposed to be started in this environment).
 */
export function startExecutionWorker(): Worker<ExecutionJobPayload, WorkerJobResult> | null {
  if (cachedWorker) return cachedWorker;
  const connection = getRedisConnection();
  if (!connection) {
    console.warn('[workflow-worker] Redis not configured — worker will not start.');
    return null;
  }

  // Global worker concurrency = max jobs ANY org's runs can occupy in total on
  // this worker process. Per-org fairness is layered on top via the in-flight
  // cap in processJob (audit C1). When tuning this, mind the shared downstream
  // resources a concurrent run consumes:
  //   • Mongo connection pool — each run does many queries; keep concurrency
  //     well under the Mongoose `maxPoolSize` (default 100) accounting for the
  //     web tier sharing the same cluster.
  //   • AI provider rate limits — runs with AI nodes hit per-key RPM/TPM caps;
  //     high concurrency can trip 429s. Raise gradually with provider headroom.
  // Scale OUT (more worker processes) rather than UP past those ceilings.
  const concurrency = Math.max(1, Number(process.env.WORKFLOW_WORKER_CONCURRENCY || 5));

  cachedWorker = new Worker<ExecutionJobPayload, WorkerJobResult>(
    EXECUTION_QUEUE_NAME,
    processJob,
    {
      // ioredis client passed directly; BullMQ types are lagging the runtime union.
      connection: connection as unknown as ConnectionOptions,
      concurrency,
      // Engine owns retry logic; keep the queue a dumb pipe.
      autorun: true,
    }
  );

  cachedWorker.on('ready', () => {
    console.log(`[workflow-worker] Ready — concurrency=${concurrency}`);
  });
  cachedWorker.on('completed', (job, result) => {
    console.log(
      `[workflow-worker] Completed ${job.id} — execution=${result.executionId} status=${result.status}`
    );
  });
  cachedWorker.on('failed', (job, err) => {
    console.error(`[workflow-worker] Job ${job?.id} errored:`, err?.message || err);
  });
  cachedWorker.on('error', (err) => {
    console.error('[workflow-worker] Worker error:', err?.message || err);
  });

  return cachedWorker;
}

export async function stopExecutionWorker(): Promise<void> {
  if (!cachedWorker) return;
  await cachedWorker.close();
  cachedWorker = null;
}
