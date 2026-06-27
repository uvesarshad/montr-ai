/**
 * Event Resumer (FUP-2).
 *
 * Bridges the gap between the execution engine's `ExecutionPausedForEvent`
 * pause primitive and the trigger dispatcher's incoming-event surface.
 *
 * When a node throws `ExecutionPausedForEvent({ kind, key, timeoutMs })`,
 * the engine persists the spec at `execution.context.pausedForEvent`. This
 * module:
 *
 *   1. `resumePausedExecutionsForEvent({ kind, key, payload })` — called from
 *      the trigger dispatcher (or directly from a webhook handler) whenever
 *      an event lands. Finds paused executions with matching kind+key,
 *      re-enqueues each with the event payload bound to the wait node's
 *      output variable.
 *
 *   2. `scheduleEventTimeoutResume({ executionId, delayMs, ... })` — called
 *      by the engine when pausing. Schedules a BullMQ delayed job that fires
 *      after `delayMs` and resumes the execution with `{ timedOut: true }`
 *      if it's still paused.
 *
 *   3. `handleEventTimeoutJob(payload)` — the worker entry point for the
 *      timeout job. Idempotent: a no-op if the execution has already been
 *      resumed by an actual event.
 */

import { Types } from 'mongoose';
import { connectMongoose } from '@/lib/mongodb';
import UnifiedWorkflowExecution from '@/lib/db/models/unified-workflow-execution.model';
import { getExecutionQueue } from '@/lib/workflow/queue/execution-queue';
import { isQueueConfigured } from '@/lib/workflow/queue/connection';

export const EVENT_TIMEOUT_JOB_NAME = 'event-pause-timeout';

interface PausedForEventSpec {
  kind: string;
  key?: string;
  timeoutMs?: number;
  deadline?: Date;
  waitNodeId: string;
  nextNodeIds: string[];
  payload?: Record<string, unknown>;
  pausedAt: Date;
}

interface PausedExecutionDoc {
  _id: Types.ObjectId | string;
  context?: { pausedForEvent?: PausedForEventSpec };
}

export interface EventArrival {
  kind: string;
  /** Matching key — contactId, phone, threadId, etc. */
  key?: string;
  /** Free-form payload bound to the wait node's output variable on resume. */
  payload?: Record<string, unknown>;
}

export interface ResumeReport {
  matched: number;
  resumed: number;
  failed: Array<{ executionId: string; error: string }>;
}

/**
 * Find every paused execution whose `pausedForEvent.kind + key` matches the
 * arriving event and re-enqueue each via the execution queue's resume path.
 *
 * Trigger dispatchers (`triggers/dispatch.ts`) should call this in addition
 * to their existing "enqueue new execution per matching workflow" logic.
 * They serve different purposes — workflows fire NEW runs on triggers;
 * paused-for-event executions resume EXISTING runs.
 */
export async function resumePausedExecutionsForEvent(
  event: EventArrival
): Promise<ResumeReport> {
  await connectMongoose();
  const report: ResumeReport = { matched: 0, resumed: 0, failed: [] };

  const query: Record<string, unknown> = {
    status: 'paused',
    'context.pausedForEvent.kind': event.kind,
  };
  if (event.key !== undefined) {
    query['context.pausedForEvent.key'] = event.key;
  }

  const paused = (await UnifiedWorkflowExecution.find(query)
    .select('_id context')
    .lean()
    .exec()) as unknown as PausedExecutionDoc[];

  report.matched = paused.length;
  if (paused.length === 0) return report;

  const queue = isQueueConfigured() ? getExecutionQueue() : null;
  for (const doc of paused) {
    const spec = doc.context?.pausedForEvent;
    if (!spec) continue;
    const executionId = String(doc._id);
    try {
      // Bind the event payload to the wait node's output BEFORE resuming so
      // downstream branches see `{{$<waitNodeId>.matched}}`, etc.
      await UnifiedWorkflowExecution.updateOne(
        { _id: doc._id },
        {
          $set: {
            [`context.eventResume.${spec.waitNodeId}`]: {
              matched: true,
              payload: event.payload ?? {},
              eventKind: event.kind,
              eventKey: event.key,
              receivedAt: new Date(),
            },
          },
          $unset: { 'context.pausedForEvent': 1 },
        }
      );

      if (queue) {
        await queue.add('resume-paused', {
          workflowId: '',
          userId: '',
          executionId,
          resume: {
            fromNodeIds: spec.nextNodeIds,
            delayNodeId: spec.waitNodeId,
          },
        });
      } else {
        // Inline path for dev / single-process. The worker handler in
        // `src/lib/workflow/queue/worker.ts` already knows how to call
        // `engine.resume()` — fall through to it directly so the resume runs
        // synchronously when Redis isn't configured.
        const { UnifiedWorkflowExecutionEngine } = await import('../unified-execution-engine');
        const engine = new UnifiedWorkflowExecutionEngine();
        engine.resume({ executionId, fromNodeIds: spec.nextNodeIds }).catch(err =>
          console.error('[event-resumer] inline resume failed:', err)
        );
      }

      report.resumed += 1;
    } catch (error) {
      report.failed.push({
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}

interface ScheduleTimeoutInput {
  executionId: string;
  delayMs: number;
  kind: string;
  key?: string;
}

/**
 * Schedule a BullMQ delayed job that fires after `delayMs` and resumes the
 * execution with `{ timedOut: true }` if it's still paused for the same
 * event. Called by the engine right after persisting the pause spec.
 *
 * Falls through to inline `setTimeout` when Redis isn't configured — keeps
 * dev mode functional, but the timeout is process-scoped (lost on restart).
 */
export async function scheduleEventTimeoutResume(input: ScheduleTimeoutInput): Promise<void> {
  const queue = isQueueConfigured() ? getExecutionQueue() : null;
  if (queue) {
    await queue.add(
      EVENT_TIMEOUT_JOB_NAME,
      {
        executionId: input.executionId,
        kind: input.kind,
        key: input.key,
        // Re-using `ExecutionJobPayload`-compatible fields so the worker
        // dispatcher can route this job alongside normal execution jobs.
        // The worker recognises the job name and calls handleEventTimeoutJob.
        workflowId: '',
        userId: '',
      } as Record<string, unknown>,
      { delay: input.delayMs }
    );
    return;
  }

  // In-process fallback — short timeouts only. Workers in production always
  // have Redis, so this branch is dev-only.
  setTimeout(() => {
    handleEventTimeoutJob({
      executionId: input.executionId,
      kind: input.kind,
      key: input.key,
    }).catch(err => console.error('[event-resumer] inline timeout failed:', err));
  }, input.delayMs).unref?.();
}

export interface EventTimeoutPayload {
  executionId: string;
  kind: string;
  key?: string;
}

/**
 * Worker entry point for the delayed timeout job. Idempotent — a no-op if
 * the execution has already been resumed by an actual event (the pause spec
 * was unset, or the execution is no longer paused).
 */
export async function handleEventTimeoutJob(payload: EventTimeoutPayload): Promise<void> {
  await connectMongoose();
  const doc = (await UnifiedWorkflowExecution.findById(payload.executionId)
    .select('_id status context')
    .lean()
    .exec()) as unknown as PausedExecutionDoc & { status?: string } | null;

  if (!doc) return; // execution gone
  if (doc.status !== 'paused') return; // already resumed by an event
  const spec = doc.context?.pausedForEvent;
  if (!spec) return; // pause spec cleared — resumed elsewhere
  // Confirm the spec still matches our timeout (defends against a re-pause
  // for a different kind/key sharing the same execution).
  if (spec.kind !== payload.kind) return;
  if (payload.key !== undefined && spec.key !== payload.key) return;

  await UnifiedWorkflowExecution.updateOne(
    { _id: doc._id },
    {
      $set: {
        [`context.eventResume.${spec.waitNodeId}`]: {
          matched: false,
          timedOut: true,
          timeoutSec: Math.round((spec.timeoutMs ?? 0) / 1000),
          eventKind: spec.kind,
          eventKey: spec.key,
          receivedAt: new Date(),
        },
      },
      $unset: { 'context.pausedForEvent': 1 },
    }
  );

  const queue = isQueueConfigured() ? getExecutionQueue() : null;
  if (queue) {
    await queue.add('resume-paused', {
      workflowId: '',
      userId: '',
      executionId: payload.executionId,
      resume: { fromNodeIds: spec.nextNodeIds, delayNodeId: spec.waitNodeId },
    });
  } else {
    const { UnifiedWorkflowExecutionEngine } = await import('../unified-execution-engine');
    const engine = new UnifiedWorkflowExecutionEngine();
    engine.resume({ executionId: payload.executionId, fromNodeIds: spec.nextNodeIds }).catch(err =>
      console.error('[event-resumer] inline timeout resume failed:', err)
    );
  }
}
