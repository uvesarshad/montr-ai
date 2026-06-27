/**
 * Cron-based schedule trigger worker (T-1).
 *
 * Workflows with `trigger.type === 'scheduled'` and a `cronExpression` become
 * BullMQ repeatable jobs on the execution queue. BullMQ owns the wall-clock
 * scheduling — we just sync the workflow list to the queue on boot and on
 * create/update/delete. The queue's worker fires the same `execute` jobs a
 * manual run would, so the execution path is identical.
 *
 * Lifecycle:
 *   - boot:            syncAllScheduledWorkflows()
 *   - on create/update: registerScheduledWorkflow(workflow)
 *   - on delete/pause:  unregisterScheduledWorkflow(workflowId)
 */

import { getExecutionQueue } from './execution-queue';
import { isQueueConfigured } from './connection';
import type { ExecutionJobPayload } from './execution-queue';

/** Prefix used when minting the scheduler id so admins can pick it out of the keys. */
const SCHEDULER_ID_PREFIX = 'workflow-schedule';

function schedulerId(workflowId: string): string {
  return `${SCHEDULER_ID_PREFIX}:${workflowId}`;
}

interface ScheduledWorkflowLike {
  _id: unknown;
  status: string;
  createdById: unknown;
  trigger?: { type: string; config?: { cronExpression?: string; timezone?: string } };
}

/**
 * Register (or update) a workflow's repeatable job. Safe to call repeatedly —
 * BullMQ's upsertJobScheduler replaces the prior definition if the key already
 * exists, so cron-expression edits take effect immediately.
 *
 * Returns `true` if the workflow was scheduled, `false` if it's not eligible
 * (inactive, missing cron, etc.).
 */
export async function registerScheduledWorkflow(
  workflow: ScheduledWorkflowLike
): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  if (workflow.status !== 'active') return false;
  if (workflow.trigger?.type !== 'scheduled') return false;

  const pattern = workflow.trigger?.config?.cronExpression?.trim();
  if (!pattern) {
    console.warn(
      `[workflow-scheduler] Workflow ${workflow._id} is scheduled but has no cronExpression.`
    );
    return false;
  }

  const tz = workflow.trigger?.config?.timezone || 'UTC';
  const queue = getExecutionQueue();
  if (!queue) return false;

  const payload: ExecutionJobPayload = {
    workflowId: String(workflow._id),
    userId: String(workflow.createdById),
    triggerData: {},
    source: 'schedule',
  };

  // BullMQ v5 API — upsertJobScheduler: one canonical method to create or
  // replace a repeatable. Using the workflow id as the scheduler id means a
  // workflow can only have one schedule at a time (which is what we want).
  await queue.upsertJobScheduler(
    schedulerId(String(workflow._id)),
    { pattern, tz },
    {
      name: 'execute',
      data: payload,
      opts: {
        // Don't let scheduled runs pile up on a wedged worker — each tick is
        // independent, so a missed tick is lost, not queued behind others.
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600, count: 2000 },
      },
    }
  );

  console.log(
    `[workflow-scheduler] Registered schedule for workflow ${workflow._id} (${pattern} ${tz}).`
  );
  return true;
}

/**
 * Remove a workflow's repeatable job. Called when a workflow is deleted,
 * paused, or its trigger type changes away from 'scheduled'.
 */
export async function unregisterScheduledWorkflow(workflowId: string): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  const queue = getExecutionQueue();
  if (!queue) return false;

  const removed = await queue.removeJobScheduler(schedulerId(workflowId));
  if (removed) {
    console.log(`[workflow-scheduler] Unregistered schedule for workflow ${workflowId}.`);
  }
  return !!removed;
}

/**
 * Load every active scheduled workflow and (re)register its repeatable job.
 * Idempotent — safe to run on every worker boot. Logs a one-line summary.
 */
export async function syncAllScheduledWorkflows(): Promise<{
  registered: number;
  skipped: number;
  errors: number;
}> {
  if (!isQueueConfigured()) {
    console.warn('[workflow-scheduler] Redis not configured — skipping schedule sync.');
    return { registered: 0, skipped: 0, errors: 0 };
  }

  const { UnifiedWorkflow } = await import('../../db/models/unified-workflow.model');
  const workflows = await UnifiedWorkflow.find({
    status: 'active',
    'trigger.type': 'scheduled',
  }).lean();

  // Set of workflow ids that legitimately deserve a schedule right now.
  const liveWorkflowIds = new Set(workflows.map((wf) => String(wf._id)));

  let registered = 0;
  let skipped = 0;
  let errors = 0;
  for (const wf of workflows) {
    try {
      const ok = await registerScheduledWorkflow(wf as ScheduledWorkflowLike);
      if (ok) registered++;
      else skipped++;
    } catch (err: unknown) {
      errors++;
      console.error(
        `[workflow-scheduler] Failed to register workflow ${wf._id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Prune orphans: any repeatable still in Redis whose workflow no longer exists
  // (deleted) or is no longer an active scheduled trigger (paused / trigger-type
  // changed). Without this, a deleted/paused automation keeps firing forever.
  const pruned = await pruneOrphanedSchedulers(liveWorkflowIds);

  console.log(
    `[workflow-scheduler] Sync complete — registered=${registered} skipped=${skipped} errors=${errors} pruned=${pruned} total=${workflows.length}`
  );
  return { registered, skipped, errors };
}

/**
 * Remove every job scheduler on the execution queue whose workflow id is not in
 * `liveWorkflowIds`. Only touches schedulers minted by this module (prefixed with
 * SCHEDULER_ID_PREFIX) so we never clobber unrelated repeatables. Returns the
 * number of schedulers removed.
 */
async function pruneOrphanedSchedulers(liveWorkflowIds: Set<string>): Promise<number> {
  const queue = getExecutionQueue();
  if (!queue) return 0;

  let schedulers: Array<{ key?: string; id?: string }> = [];
  try {
    // BullMQ v5 — getJobSchedulers() returns the queue's repeatable definitions.
    schedulers = (await queue.getJobSchedulers()) as Array<{ key?: string; id?: string }>;
  } catch (err) {
    console.error('[workflow-scheduler] Failed to enumerate job schedulers for pruning:', err);
    return 0;
  }

  let pruned = 0;
  const prefix = `${SCHEDULER_ID_PREFIX}:`;
  for (const s of schedulers) {
    const id = s?.id ?? s?.key;
    if (!id || !id.startsWith(prefix)) continue;
    const workflowId = id.slice(prefix.length);
    if (liveWorkflowIds.has(workflowId)) continue;
    try {
      const removed = await queue.removeJobScheduler(id);
      if (removed) {
        pruned++;
        console.log(`[workflow-scheduler] Pruned orphaned schedule ${id}.`);
      }
    } catch (err) {
      console.error(`[workflow-scheduler] Failed to prune orphaned schedule ${id}:`, err);
    }
  }
  return pruned;
}
