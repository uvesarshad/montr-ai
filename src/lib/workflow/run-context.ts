/**
 * RunContext — serializable view of an in-flight workflow run.
 *
 * Today the engine keeps per-run state in a mix of Mongoose doc fields (variables,
 * executionPath), in-memory maps (nodeOutputs), and counters. That's fine for a
 * single-process inline run, but it breaks down for:
 *   - pause/resume (need to reboot the run on a different worker)
 *   - re-run from failed node (need prior node outputs)
 *   - observability (no stable shape to attach to a ticket)
 *
 * RunContext gives us one place to assemble, snapshot, and rehydrate that state.
 * The engine constructs one at the top of `execute()` and uses the atomic write
 * helpers below to mutate both the in-memory snapshot and the Mongo document in
 * a single pass — no `doc.save()` on the critical path.
 */
import { Types } from 'mongoose';
import { UnifiedWorkflowExecution, IUnifiedWorkflowExecution } from '../db/models/unified-workflow-execution.model';
import { IExecutionStep, ExecutionStatus } from '../db/models/unified-workflow.model';

export interface RunContextSnapshot {
  executionId: string;
  workflowId: string;
  organizationId: string;
  userId: string;
  status: ExecutionStatus;
  currentNodeId?: string;
  currentStep: number;
  variables: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  counters: {
    nodeExecutions: number;
    aiCalls: number;
    httpCalls: number;
    healAttemptsTotal: number;
    healAttemptsByNode: Record<string, number>;
  };
}

export class RunContext {
  public readonly executionId: string;
  public readonly workflowId: string;
  public readonly organizationId: string;
  public readonly userId: string;

  // Counters live here, not on the engine — makes them trivial to snapshot.
  public counters = {
    nodeExecutions: 0,
    aiCalls: 0,
    httpCalls: 0,
    healAttemptsTotal: 0,
    healAttemptsByNode: new Map<string, number>(),
  };

  // Mirror of the Mongo doc's hot fields. We keep them here so callers can read
  // without re-fetching; atomic writes update both Mongo and this mirror.
  public variables: Record<string, unknown>;
  public nodeOutputs: Map<string, unknown>;
  public currentNodeId?: string;

  constructor(opts: {
    executionId: string;
    workflowId: string;
    organizationId: string;
    userId: string;
    variables?: Record<string, unknown>;
    nodeOutputs?: Map<string, unknown>;
  }) {
    this.executionId = opts.executionId;
    this.workflowId = opts.workflowId;
    this.organizationId = opts.organizationId;
    this.userId = opts.userId;
    this.variables = opts.variables || {};
    this.nodeOutputs = opts.nodeOutputs || new Map();
  }

  /**
   * Rehydrate a RunContext from a persisted execution record. Used by the
   * pause/resume and re-run-from-failed paths to pick up where we left off.
   * `nodeOutputs` is best-effort: we reconstruct it from the successful steps
   * in executionPath so downstream nodes that reference earlier outputs still
   * resolve.
   */
  static fromExecution(exec: IUnifiedWorkflowExecution): RunContext {
    const outputs = new Map<string, unknown>();
    for (const step of exec.executionPath || []) {
      if (step.status === 'success' && step.output !== undefined) {
        outputs.set(step.nodeId, step.output);
      }
    }
    const ctx = new RunContext({
      executionId: exec._id.toString(),
      workflowId: exec.workflowId.toString(),
      organizationId: exec.userId.toString(),
      userId: exec.userId.toString(),
      variables: { ...(exec.variables || {}) },
      nodeOutputs: outputs,
    });
    ctx.currentNodeId = exec.currentNodeId;
    return ctx;
  }

  snapshot(): RunContextSnapshot {
    return {
      executionId: this.executionId,
      workflowId: this.workflowId,
      organizationId: this.organizationId,
      userId: this.userId,
      status: ExecutionStatus.RUNNING,
      currentNodeId: this.currentNodeId,
      currentStep: this.nodeOutputs.size,
      variables: { ...this.variables },
      nodeOutputs: Object.fromEntries(this.nodeOutputs.entries()),
      counters: {
        nodeExecutions: this.counters.nodeExecutions,
        aiCalls: this.counters.aiCalls,
        httpCalls: this.counters.httpCalls,
        healAttemptsTotal: this.counters.healAttemptsTotal,
        healAttemptsByNode: Object.fromEntries(this.counters.healAttemptsByNode.entries()),
      },
    };
  }
}

// ============================================
// Atomic write helpers
// ============================================
//
// All writes use `updateOne` with MongoDB operators ($set / $push / $inc /
// $unset) instead of `doc.save()`. The engine used to call instance methods
// that did full-document saves — safe for a single linear flow, but the moment
// two parallel branches (or bounded-parallel loops) landed concurrent writes,
// they raced and trampled each other's executionPath pushes. The operators
// below serialize through Mongo, not through our doc, so concurrent pushes
// compose correctly.

const Execution = () => UnifiedWorkflowExecution;

export async function writeStatus(
  executionId: string,
  status: ExecutionStatus,
  extra?: { error?: string; errorStack?: string; errorNodeId?: string; completedAt?: Date; duration?: number }
): Promise<void> {
  const setFields: Record<string, unknown> = { status };
  if (extra?.error !== undefined) setFields.error = extra.error;
  if (extra?.errorStack !== undefined) setFields.errorStack = extra.errorStack;
  if (extra?.errorNodeId !== undefined) setFields.errorNodeId = extra.errorNodeId;
  if (extra?.completedAt) setFields.completedAt = extra.completedAt;
  if (extra?.duration !== undefined) setFields.duration = extra.duration;
  await Execution().updateOne({ _id: new Types.ObjectId(executionId) }, { $set: setFields });
}

export async function pushStep(
  executionId: string,
  step: Omit<IExecutionStep, 'timestamp'>
): Promise<IExecutionStep> {
  const stamped: IExecutionStep = { ...step, timestamp: new Date() };
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    {
      $push: { executionPath: stamped },
      $inc: { currentStep: 1 },
    }
  );
  return stamped;
}

export async function writeCurrentNode(executionId: string, nodeId: string): Promise<void> {
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    { $set: { currentNodeId: nodeId } }
  );
}

export async function writeVariable(executionId: string, name: string, value: unknown): Promise<void> {
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    { $set: { [`variables.${name}`]: value } }
  );
}

export async function writeVariables(executionId: string, patch: Record<string, unknown>): Promise<void> {
  const setFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    setFields[`variables.${k}`] = v;
  }
  if (Object.keys(setFields).length === 0) return;
  await Execution().updateOne({ _id: new Types.ObjectId(executionId) }, { $set: setFields });
}

export async function writeRetry(executionId: string, retryDelayMs: number): Promise<void> {
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    {
      $inc: { retryCount: 1 },
      $set: {
        status: ExecutionStatus.PENDING,
        nextRetryAt: new Date(Date.now() + retryDelayMs),
      },
    }
  );
}

export async function pushParallelBranch(
  executionId: string,
  branch: { branchId: string; nodeIds: string[] }
): Promise<void> {
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    {
      $push: {
        parallelBranches: {
          ...branch,
          status: ExecutionStatus.RUNNING,
        },
      },
    }
  );
}

export async function writeParallelBranch(
  executionId: string,
  branchId: string,
  status: ExecutionStatus
): Promise<void> {
  const setFields: Record<string, unknown> = { 'parallelBranches.$[b].status': status };
  if (status === ExecutionStatus.COMPLETED || status === ExecutionStatus.FAILED) {
    setFields['parallelBranches.$[b].completedAt'] = new Date();
  }
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    { $set: setFields },
    { arrayFilters: [{ 'b.branchId': branchId }] }
  );
}

export async function writeLoopInit(
  executionId: string,
  nodeId: string,
  iterationData: unknown[]
): Promise<void> {
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    {
      $set: {
        loopState: {
          nodeId,
          currentIteration: 0,
          totalIterations: iterationData.length,
          iterationData,
        },
      },
    }
  );
}

export async function writeLoopIncrement(executionId: string): Promise<void> {
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    { $inc: { 'loopState.currentIteration': 1 } }
  );
}

export async function writeLoopClear(executionId: string): Promise<void> {
  await Execution().updateOne(
    { _id: new Types.ObjectId(executionId) },
    { $unset: { loopState: 1 } }
  );
}
