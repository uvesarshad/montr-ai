/**
 * Execution history retention / pruner (audit finding H4).
 *
 * `unified_workflow_executions` stores full per-step input/output/variables
 * (Mixed) with NO TTL and NO prune. In a multi-tenant deployment this grows
 * without bound. The legacy `deleteOlderThan` helper was dead code targeting the
 * wrong collection — there was never a real pruner.
 *
 * This module is the daily pruner, modeled on `execution-sweeper.ts`:
 *   - its own BullMQ queue + a daily repeatable cron job,
 *   - a worker consumer that runs the prune,
 *   - a Redis `SET NX PX` lock so only one worker instance prunes per tick.
 *
 * Retention is fully plan-driven (super-admin controlled, defaults seeded):
 *   - `completed` / `cancelled` runs older than `executionRetentionDays`,
 *   - `failed` runs older than `failedExecutionRetentionDays`,
 *   - plus a hard per-org row cap `maxStoredExecutions` (oldest terminal rows
 *     pruned once retained count exceeds the cap).
 * Any of these missing / set to `-1` means "keep forever" (legacy plans whose
 * features predate these fields are therefore unaffected). All deletes are
 * org-scoped (filtered by `organizationId`). PENDING / RUNNING / PAUSED runs are
 * never touched — only terminal records are pruned.
 *
 * NOTE: pruning at >= 30 days never affects the monthly execution quota in
 * `plan-enforcement.ts#canExecuteWorkflow`, which only counts rows with
 * `startedAt >= startOfMonth` (the current calendar month).
 */

import type { Job } from 'bullmq';
import { Queue, Worker, ConnectionOptions } from 'bullmq';
import { getRedisConnection, isQueueConfigured } from './connection';
import { withRedisLock } from './redis-lock';
import { getOrgPlanFeatures } from '@/lib/plan-enforcement';

export const PRUNER_QUEUE_NAME = 'workflow-pruner';
const PRUNE_JOB_NAME = 'prune-executions';
const PRUNE_REPEAT_JOB_ID = 'workflow-pruner-cron';

/** Distributed lock so only one worker instance prunes per tick. */
const PRUNE_LOCK_KEY = 'workflow:pruner:lock';
const PRUNE_LOCK_TTL_MS = 30 * 60 * 1000; // 30 min — a prune pass should finish well within this.

/** Cap how many docs we delete per (org, rule) pass so one tick can't run away. */
const PRUNE_DELETE_BATCH = 5000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PruneReport {
  orgsScanned: number;
  deletedTerminal: number;   // completed/cancelled removed by age
  deletedFailed: number;     // failed removed by age
  deletedOverCap: number;    // removed by per-org row cap
  errors: number;
}

/**
 * Prune terminal executions per org according to that org's plan retention.
 * Idempotent and safe to run alongside live executions — only terminal records
 * outside their plan window (or beyond the row cap) are removed.
 */
export async function pruneExecutionHistory(): Promise<PruneReport> {
  const report: PruneReport = {
    orgsScanned: 0,
    deletedTerminal: 0,
    deletedFailed: 0,
    deletedOverCap: 0,
    errors: 0,
  };

  // Lazy imports to keep this module light when the worker isn't running it.
  const { connectMongoose } = await import('@/lib/mongodb');
  await connectMongoose();

  const { ExecutionStatus } = await import('@/lib/db/models/unified-workflow.model');
  const { default: UnifiedWorkflowExecution } = await import(
    '@/lib/db/models/unified-workflow-execution.model'
  );

  // Enumerate every org that currently has executions stored. distinct() is the
  // simplest correct enumeration; the org count is bounded by tenants, not rows.
  const orgIds = (await UnifiedWorkflowExecution.distinct('organizationId')) as unknown[];

  const now = Date.now();

  for (const rawOrgId of orgIds) {
    if (rawOrgId === null || rawOrgId === undefined) continue;
    const organizationId = String(rawOrgId);
    report.orgsScanned++;

    try {
      const features = await getOrgPlanFeatures(organizationId);

      const terminalDays = features.executionRetentionDays;
      const failedDays = features.failedExecutionRetentionDays;
      const maxStored = features.maxStoredExecutions;

      // ── 1. Age-based prune: completed/cancelled ──────────────────────────
      // Treat missing / <= 0 (other than the explicit -1 "forever") defensively:
      // only a positive day count enables age pruning; -1 and 0/undefined keep.
      if (typeof terminalDays === 'number' && terminalDays > 0) {
        const cutoff = new Date(now - terminalDays * MS_PER_DAY);
        const res = await UnifiedWorkflowExecution.deleteMany({
          status: { $in: [ExecutionStatus.COMPLETED, ExecutionStatus.CANCELLED] },
          startedAt: { $lt: cutoff },
        });
        report.deletedTerminal += res.deletedCount ?? 0;
      }

      // ── 2. Age-based prune: failed (usually a longer window) ─────────────
      if (typeof failedDays === 'number' && failedDays > 0) {
        const cutoff = new Date(now - failedDays * MS_PER_DAY);
        const res = await UnifiedWorkflowExecution.deleteMany({
          status: ExecutionStatus.FAILED,
          startedAt: { $lt: cutoff },
        });
        report.deletedFailed += res.deletedCount ?? 0;
      }

      // ── 3. Hard per-org row cap on retained terminal executions ──────────
      // Keep the newest `maxStored` terminal rows; delete the rest. Only acts on
      // terminal statuses so in-flight runs are never counted or removed.
      if (typeof maxStored === 'number' && maxStored >= 0) {
        const terminalFilter = {
          status: {
            $in: [
              ExecutionStatus.COMPLETED,
              ExecutionStatus.CANCELLED,
              ExecutionStatus.FAILED,
            ],
          },
        };
        const total = await UnifiedWorkflowExecution.countDocuments(terminalFilter);
        if (total > maxStored) {
          // Find the cutoff `_id`s: skip the newest `maxStored`, delete older ones.
          const overflow = Math.min(total - maxStored, PRUNE_DELETE_BATCH);
          const stale = await UnifiedWorkflowExecution.find(terminalFilter)
            .select('_id')
            .sort({ startedAt: -1 })
            .skip(maxStored)
            .limit(overflow)
            .lean()
            .exec();
          if (stale.length > 0) {
            const res = await UnifiedWorkflowExecution.deleteMany({
              _id: { $in: stale.map((d) => d._id) },
            });
            report.deletedOverCap += res.deletedCount ?? 0;
          }
        }
      }
    } catch (err) {
      report.errors++;
      console.error(
        `[execution-pruner] Failed to prune org ${organizationId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (
    report.deletedTerminal > 0 ||
    report.deletedFailed > 0 ||
    report.deletedOverCap > 0 ||
    report.errors > 0
  ) {
    console.log(
      `[execution-pruner] Prune complete — orgs=${report.orgsScanned} ` +
        `deletedTerminal=${report.deletedTerminal} deletedFailed=${report.deletedFailed} ` +
        `deletedOverCap=${report.deletedOverCap} errors=${report.errors}`,
    );
  }
  return report;
}

/**
 * Run the prune under a distributed Redis lock so only one worker instance acts
 * per tick. Returns null if the lock wasn't acquired (another worker is pruning).
 */
export async function pruneExecutionHistoryLocked(): Promise<PruneReport | null> {
  return withRedisLock(PRUNE_LOCK_KEY, PRUNE_LOCK_TTL_MS, pruneExecutionHistory);
}

// ── BullMQ cron registration + consumer ──────────────────────────────────

let cachedPrunerQueue: Queue | null | undefined;

function getPrunerQueue(): Queue | null {
  if (cachedPrunerQueue !== undefined) return cachedPrunerQueue;
  const connection = getRedisConnection();
  if (!connection) {
    cachedPrunerQueue = null;
    return null;
  }
  cachedPrunerQueue = new Queue(PRUNER_QUEUE_NAME, {
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 7 * 24 * 3600, count: 30 },
      removeOnFail: { age: 14 * 24 * 3600, count: 60 },
    },
  });
  return cachedPrunerQueue;
}

/**
 * Register the daily pruner cron. Idempotent (fixed repeat jobId).
 * No-op when Redis isn't configured.
 */
export async function scheduleExecutionPruner(): Promise<void> {
  if (!isQueueConfigured()) {
    console.warn('[execution-pruner] Redis not configured — pruner cron skipped.');
    return;
  }
  const queue = getPrunerQueue();
  if (!queue) return;
  await queue.add(
    PRUNE_JOB_NAME,
    { trigger: 'cron' },
    {
      repeat: { pattern: '30 4 * * *' }, // Daily at 04:30 (after CRM trash purge at 3 AM).
      jobId: PRUNE_REPEAT_JOB_ID,
    },
  );
  console.log('[execution-pruner] Pruner cron registered (daily 04:30).');
}

let cachedPrunerWorker: Worker | null = null;

/** Start the consumer that runs the prune when the cron fires. */
export function createExecutionPrunerWorker(): Worker | null {
  if (cachedPrunerWorker) return cachedPrunerWorker;
  const connection = getRedisConnection();
  if (!connection) return null;

  cachedPrunerWorker = new Worker(
    PRUNER_QUEUE_NAME,
    async (_job: Job) => {
      const result = await pruneExecutionHistoryLocked();
      return result ?? { skipped: 'lock-held' };
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1,
    },
  );

  cachedPrunerWorker.on('failed', (job, err) => {
    console.error(`[execution-pruner] Prune job ${job?.id} failed:`, err?.message || err);
  });
  cachedPrunerWorker.on('error', (err) => {
    console.error('[execution-pruner] Worker error:', err?.message || err);
  });

  return cachedPrunerWorker;
}
