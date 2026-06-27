/**
 * Polling-trigger scheduler (audit finding H5).
 *
 * Mirrors `scheduler.ts` (scheduled-workflow machinery) but for `polling`
 * triggers. A workflow whose trigger.type is `polling` becomes a BullMQ
 * repeatable job on the POLLING queue, firing every `intervalMinutes`. Each fire
 * runs the FETCHER (not the workflow) — see `triggers/polling/index.ts`.
 *
 * Lifecycle (identical hooks to scheduled workflows):
 *   - boot:             syncAllPollingWorkflows()
 *   - on create/update: registerPollingWorkflow(workflow)   ← canvas-sync
 *   - on delete/pause:  unregisterPollingWorkflow(workflowId) ← canvas-sync / delete route
 *
 * Orphan pruning is folded into the scheduled-workflow boot reconcile (see
 * scheduler.ts → pruneOrphanedSchedulers, which now also covers POLL_SCHEDULER_ID_PREFIX).
 */

import { getPollingQueue, type PollingJobPayload } from './polling-queue';
import { isQueueConfigured } from './connection';

/** Prefix on the scheduler id so admins (and the pruner) can pick poll jobs out. */
export const POLL_SCHEDULER_ID_PREFIX = 'workflow-poll';

/** Floor / default for poll cadence — never poll more often than every 5 min. */
export const MIN_POLL_INTERVAL_MINUTES = 5;
export const DEFAULT_POLL_INTERVAL_MINUTES = 15;

function pollSchedulerId(workflowId: string): string {
  return `${POLL_SCHEDULER_ID_PREFIX}:${workflowId}`;
}

interface PollingWorkflowLike {
  _id: unknown;
  status: string;
  trigger?: {
    type: string;
    config?: { pollSource?: string; intervalMinutes?: number };
  };
}

/** Clamp a configured interval to the allowed range, defaulting when unset. */
export function resolvePollIntervalMinutes(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_POLL_INTERVAL_MINUTES;
  return Math.max(MIN_POLL_INTERVAL_MINUTES, Math.floor(n));
}

/**
 * Register (or update) a workflow's polling repeatable job. Idempotent —
 * upsertJobScheduler replaces a prior definition, so interval edits take effect
 * immediately. Returns `true` when scheduled, `false` when not eligible.
 */
export async function registerPollingWorkflow(workflow: PollingWorkflowLike): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  if (workflow.status !== 'active') return false;
  if (workflow.trigger?.type !== 'polling') return false;

  const source = workflow.trigger?.config?.pollSource;
  if (!source) {
    console.warn(
      `[polling-scheduler] Workflow ${workflow._id} is a polling trigger but has no pollSource.`
    );
    return false;
  }

  const intervalMinutes = resolvePollIntervalMinutes(workflow.trigger?.config?.intervalMinutes);
  const queue = getPollingQueue();
  if (!queue) return false;

  const payload: PollingJobPayload = { workflowId: String(workflow._id), kind: 'poll' };

  await queue.upsertJobScheduler(
    pollSchedulerId(String(workflow._id)),
    { every: intervalMinutes * 60 * 1000 },
    {
      name: 'poll',
      data: payload,
      opts: {
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
      },
    }
  );

  console.log(
    `[polling-scheduler] Registered poll for workflow ${workflow._id} (${source} every ${intervalMinutes}m).`
  );
  return true;
}

/** Remove a workflow's polling repeatable job (delete / pause / trigger-type change). */
export async function unregisterPollingWorkflow(workflowId: string): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  const queue = getPollingQueue();
  if (!queue) return false;

  const removed = await queue.removeJobScheduler(pollSchedulerId(workflowId));
  if (removed) {
    console.log(`[polling-scheduler] Unregistered poll for workflow ${workflowId}.`);
  }
  return !!removed;
}

/**
 * Load every active polling workflow and (re)register its repeatable job, then
 * prune any poll scheduler in Redis whose workflow no longer qualifies. Safe to
 * run on every worker boot. Logs a one-line summary.
 */
export async function syncAllPollingWorkflows(): Promise<{
  registered: number;
  skipped: number;
  errors: number;
}> {
  if (!isQueueConfigured()) {
    console.warn('[polling-scheduler] Redis not configured — skipping poll sync.');
    return { registered: 0, skipped: 0, errors: 0 };
  }

  const { UnifiedWorkflow } = await import('../../db/models/unified-workflow.model');
  const workflows = await UnifiedWorkflow.find({
    status: 'active',
    'trigger.type': 'polling',
  }).lean();

  const liveWorkflowIds = new Set(workflows.map((wf) => String(wf._id)));

  let registered = 0;
  let skipped = 0;
  let errors = 0;
  for (const wf of workflows) {
    try {
      const ok = await registerPollingWorkflow(wf as PollingWorkflowLike);
      if (ok) registered++;
      else skipped++;
    } catch (err: unknown) {
      errors++;
      console.error(
        `[polling-scheduler] Failed to register workflow ${wf._id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const pruned = await prunePollSchedulers(liveWorkflowIds);

  console.log(
    `[polling-scheduler] Sync complete — registered=${registered} skipped=${skipped} errors=${errors} pruned=${pruned} total=${workflows.length}`
  );
  return { registered, skipped, errors };
}

/**
 * Remove every poll scheduler on the polling queue whose workflow id is not in
 * `liveWorkflowIds`. Only touches schedulers prefixed with POLL_SCHEDULER_ID_PREFIX.
 */
async function prunePollSchedulers(liveWorkflowIds: Set<string>): Promise<number> {
  const queue = getPollingQueue();
  if (!queue) return 0;

  let schedulers: Array<{ key?: string; id?: string }> = [];
  try {
    schedulers = (await queue.getJobSchedulers()) as Array<{ key?: string; id?: string }>;
  } catch (err) {
    console.error('[polling-scheduler] Failed to enumerate poll schedulers for pruning:', err);
    return 0;
  }

  let pruned = 0;
  const prefix = `${POLL_SCHEDULER_ID_PREFIX}:`;
  for (const s of schedulers) {
    const id = s?.id ?? s?.key;
    if (!id || !id.startsWith(prefix)) continue;
    const workflowId = id.slice(prefix.length);
    if (liveWorkflowIds.has(workflowId)) continue;
    try {
      const removed = await queue.removeJobScheduler(id);
      if (removed) {
        pruned++;
        console.log(`[polling-scheduler] Pruned orphaned poll schedule ${id}.`);
      }
    } catch (err) {
      console.error(`[polling-scheduler] Failed to prune orphaned poll schedule ${id}:`, err);
    }
  }
  return pruned;
}
