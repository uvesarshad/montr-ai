/**
 * Inline execution fallback used when BullMQ / Redis is not configured.
 *
 * Accepts the same payload shape the queue worker would receive and runs the
 * engine directly, in-process. Returns the execution id + terminal status so
 * callers can treat the two paths symmetrically.
 *
 * This keeps local dev zero-friction: `npm run dev` with no Redis still works.
 */

import { UnifiedWorkflowExecutionEngine } from '../unified-execution-engine';
import type { ExecutionJobPayload } from './execution-queue';

export interface InlineRunResult {
  executionId: string;
  status: string;
  error?: string;
}

export async function runInline(payload: ExecutionJobPayload): Promise<InlineRunResult> {
  const engine = new UnifiedWorkflowExecutionEngine();

  // Resume path — used when the delay-resume fallback re-enqueues inline.
  if (payload.resume && payload.executionId) {
    const execution = await engine.resume({
      executionId: payload.executionId,
      fromNodeIds: payload.resume.fromNodeIds,
    });
    return {
      executionId: execution._id.toString(),
      status: execution.status,
      error: execution.error,
    };
  }

  const execution = await engine.execute({
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

  return {
    executionId: execution._id.toString(),
    status: execution.status,
    error: execution.error,
  };
}
