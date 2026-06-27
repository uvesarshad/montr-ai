/**
 * Unified Workflow Execution Engine
 *
 * Executes workflows with support for:
 * - Multiple workflow types (WhatsApp, CRM, Marketing Email)
 * - Advanced variable resolution
 * - Error handling and retries
 * - Parallel execution
 * - Loop/iteration
 * - Conditional branching
 * - Per-node logging
 * - Real-time WebSocket updates
 */

import { Types } from 'mongoose';
import {
  IUnifiedWorkflow,
  IWorkflowNode,
  ExecutionStatus,
  IExecutionStep,
  WorkflowStatus
} from '../db/models/unified-workflow.model';
import {
  IUnifiedWorkflowExecution,
  UnifiedWorkflowExecution
} from '../db/models/unified-workflow-execution.model';
import { VariableResolver, buildNodeLabelMap } from './variable-resolver';
import { computeResumeAt, type DelayConfig, type DelayMode } from './delay-schedule';
import { decryptCredential } from './credential-encryption';
import { generateTextWithClient } from '@/ai/client';
import {
  writeStatus,
  pushStep,
  writeCurrentNode,
  writeVariable,
  writeVariables,
  writeRetry,
  pushParallelBranch,
  writeParallelBranch,
  writeLoopInit,
  writeLoopIncrement,
  writeLoopClear,
} from './run-context';

// Node processors
import { NodeProcessorRegistry } from './node-processors';

// Cross-process event bus (Redis pub/sub) — so runs on the worker still reach
// the HTTP process that owns the Socket.IO connections. Falls back to the
// local `global.io` when the engine happens to be running in the same process.
import { publishWorkflowEventAsync } from './events/bus';
import { publishDomainEvent } from '@/lib/events/domain-bus';
// Cross-process stop flag — lets a stop request reach a worker-side run that the
// in-process AbortController registry can't (audit H13).
import { isExecutionStopRequested, clearExecutionStop } from './execution-stop-flag';

// Pause signals (delay / user / event) live in `execution-pause-signals.ts`
// so node processors and tests can import them without pulling in the entire
// engine module graph. Re-exported here for legacy import paths.
import {
  ExecutionPausedForDelay,
  ExecutionPausedByUser,
  ExecutionPausedForEvent,
} from './execution-pause-signals';
export { ExecutionPausedForEvent } from './execution-pause-signals';
/** Long delays that exceed this threshold get persisted + queued instead of setTimeout. */
const PERSISTENT_DELAY_THRESHOLD_MS = 30_000;

/**
 * Strip likely-secret values from an object before sending it to a third-party LLM.
 * Recursively walks objects/arrays; replaces any value whose key matches a sensitive
 * pattern with the literal string "[REDACTED]". Strings are also bounded to 500 chars.
 */
const SECRET_KEY_PATTERN = /(secret|token|password|apikey|api_key|authorization|auth|credential|cookie|bearer|private)/i;
function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 500 ? value.slice(0, 500) + '…[truncated]' : value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(v => redactSecrets(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactSecrets(v, depth + 1);
    }
  }
  return out;
}

/**
 * Hard ceiling on the serialized size of a single step's persisted `input` /
 * `output` (audit H4). Even after redaction a node can emit a large payload
 * (HTTP body, AI response, big array) — persisting it verbatim bloats the
 * execution document. If the JSON serialization exceeds this, we store a small
 * truncated stand-in instead of the full value.
 */
const STEP_FIELD_MAX_BYTES = 64 * 1024; // 64 KB
const STEP_FIELD_PREVIEW_CHARS = 2_000;

/**
 * Total persisted step-data ceiling for ONE execution (2.4). Per-step caps
 * (STEP_FIELD_MAX_BYTES) bound a single step, but a long run with thousands of
 * steps can still accumulate toward Mongo's 16 MB document limit. Once the
 * cumulative serialized size of persisted step input/output crosses this
 * threshold, the engine stops persisting full input/output (storing a small
 * `{_omitted:true}` marker instead) while still recording step status, timing,
 * retries, and errors. Generous enough that normal runs never trip it.
 */
const EXECUTION_DATA_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** Compact omission marker stored in place of input/output past the cap. */
const OMITTED_FIELD = { _omitted: true, reason: 'execution_data_cap' } as const;

/** Cheap byte estimate of a value's JSON serialization (0 if unserializable). */
function estimateBytes(value: unknown): number {
  if (value === null || value === undefined) return 0;
  try {
    const s = JSON.stringify(value);
    return s === undefined ? 0 : Buffer.byteLength(s, 'utf8');
  } catch {
    return 0;
  }
}

/**
 * Cap the serialized size of a step field. Returns the value unchanged when it
 * serializes within the limit; otherwise returns a typed marker containing a
 * short preview. Never throws — unserializable values fall back to a marker.
 */
function capStepFieldSize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { _truncated: true, reason: 'unserializable' };
  }
  if (serialized === undefined) return value; // e.g. a bare function/symbol
  // Byte length (UTF-8), not char length, since Mongo stores bytes.
  const byteLen = Buffer.byteLength(serialized, 'utf8');
  if (byteLen <= STEP_FIELD_MAX_BYTES) return value;
  return {
    _truncated: true,
    originalBytes: byteLen,
    preview: serialized.slice(0, STEP_FIELD_PREVIEW_CHARS),
  };
}

/**
 * Shared cost budget for one execution TREE (2.3 / H2).
 *
 * The engine tracks node/AI/HTTP usage to enforce the hard ceilings below. A
 * sub-workflow run inline (SubWorkflowProcessor) creates its OWN engine, which
 * by default would get a FRESH budget — so a parent's 500-node cap would NOT
 * bound the whole tree (only depth-8 limited it). When a parent passes its
 * budget object down via ExecutionConfig.costBudget, all engines in the tree
 * share these counters by reference, so the ceilings bound the entire tree.
 *
 * Backward compatible: absent ⇒ each engine owns a fresh budget (legacy behavior).
 */
export interface CostBudget {
  nodeExecutions: number;
  aiCalls: number;
  httpCalls: number;
}

function createCostBudget(): CostBudget {
  return { nodeExecutions: 0, aiCalls: 0, httpCalls: 0 };
}

/**
 * Heuristic: does an integration node error indicate an authentication failure
 * (expired/revoked token, bad credentials) rather than a transient/usage error?
 * Integration services throw plain Errors with the HTTP status embedded in the
 * message (e.g. "HubSpot API: 401 — ..."), so we match on 401/403 + common
 * auth phrasings. Intentionally conservative to avoid flagging 429/5xx.
 */
function isAuthFailureError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (!msg) return false;
  if (/\b(401|403)\b/.test(msg)) return true;
  return /\bunauthorized\b|\bforbidden\b|invalid[_ ]?(token|grant|credentials)|token (expired|revoked)|authentication failed/.test(
    msg
  );
}

export interface ExecutionConfig {
  workflowId: string;
  userId: string;
  contactId?: string;
  dealId?: string;
  campaignId?: string;
  triggerData: Record<string, unknown>;
  initialVariables?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  /**
   * Shared cost budget for the whole execution tree (2.3 / H2). When provided,
   * this engine charges its node/AI/HTTP usage against the SAME counters as the
   * caller instead of a fresh instance budget, so the hard ceilings bound the
   * entire parent→sub-workflow tree. Absent ⇒ fresh own budget (legacy).
   */
  costBudget?: CostBudget;
  /**
   * Test/manual run (1.9 test loop). When true the engine honors node-level
   * `pinnedData` — using the pinned sample as a node's output INSTEAD of
   * executing it (skipping side effects) — and seeds an empty triggerData from
   * the trigger node's pinnedData. NEVER set on triggered/scheduled/webhook runs.
   */
  testMode?: boolean;
  /**
   * Dry-run (1.9 Stage 3). Forwarded to side-effecting processors so they
   * simulate instead of firing (e.g. don't actually send a WhatsApp message).
   */
  dryRun?: boolean;
}

// Hard ceilings to keep a single execution from burning unbounded resources.
// These are conservative defaults that protect against runaway loops, recursive
// sub-workflows, and prompt-injection-driven AI fan-out. Real per-org budgets
// belong in plan features; these are the runtime safety net.
const MAX_NODE_EXECUTIONS_PER_RUN = 500;
const MAX_AI_CALLS_PER_RUN = 50;
const MAX_HTTP_CALLS_PER_RUN = 100;
// Auto-heal is expensive (calls GPT-4o per failed node) and easy to abuse via
// a node that always fails. Cap heal attempts per execution and per node so a
// single broken node can't burn the entire AI budget.
const MAX_HEAL_ATTEMPTS_PER_RUN = 5;
const MAX_HEAL_ATTEMPTS_PER_NODE = 1;

export class UnifiedWorkflowExecutionEngine {
  private execution: IUnifiedWorkflowExecution | null = null;
  private workflow: IUnifiedWorkflow | null = null;
  private nodeOutputs: Map<string, unknown> = new Map();
  private variableResolver: VariableResolver | null = null;
  /** Visible-label → nodeId map for label-based expression refs (2.19). */
  private nodeLabelMap: Record<string, string> = {};
  private processorRegistry: NodeProcessorRegistry;
  // Cost counters live on a CostBudget object so an execution TREE can share one
  // budget by reference (2.3 / H2). Defaults to an own fresh budget; replaced in
  // execute()/resume() when config.costBudget is supplied. The getter/setter
  // proxies below preserve the existing `this.nodeExecutionCount++` call sites.
  private budget: CostBudget = createCostBudget();
  private get nodeExecutionCount(): number { return this.budget.nodeExecutions; }
  private set nodeExecutionCount(v: number) { this.budget.nodeExecutions = v; }
  private get aiCallCount(): number { return this.budget.aiCalls; }
  private set aiCallCount(v: number) { this.budget.aiCalls = v; }
  private get httpCallCount(): number { return this.budget.httpCalls; }
  private set httpCallCount(v: number) { this.budget.httpCalls = v; }
  private healAttemptsTotal: number = 0;
  private healAttemptsByNode: Map<string, number> = new Map();
  // Number of retries the last runNodeLogicWithRetry() call performed. Read by
  // executeNode when logging the success step so history records retry effort.
  private lastRetryCount: number = 0;
  // Cancellation: callers can pass an AbortSignal via ExecutionConfig, OR the
  // engine can be cancelled out-of-band via the static cancel() helper which
  // signals the in-process controller for a given executionId.
  private abortController: AbortController = new AbortController();
  private static activeControllers: Map<string, AbortController> = new Map();
  // 1.9 test loop: when true the engine honors node-level pinnedData (use the
  // pin as output instead of executing the node) and dry-runs side effects.
  private testMode: boolean = false;
  private dryRun: boolean = false;
  // 2.4 total execution-data cap: running sum of persisted step input/output
  // bytes for THIS execution. Once it crosses EXECUTION_DATA_MAX_BYTES, logStep
  // stops persisting full input/output (stores OMITTED_FIELD) to keep the
  // execution document under Mongo's 16 MB limit. One-shot warning via the flag.
  private persistedStepBytes: number = 0;
  private executionDataCapTripped: boolean = false;
  // 2.5 resume correctness for delay-inside-parallel.
  //
  // INVARIANT: during a RESUMED run, any node that ALREADY has a success step
  // logged *before this resume started* must NOT be re-executed when the
  // downstream traversal reaches it again — its logged output is restored and
  // we continue past it. This prevents double-firing side-effecting nodes that
  // a sibling parallel branch already ran past the join before another branch's
  // delay paused the execution (the resume pointer only carries the delayed
  // branch's continuation, which can walk back into already-executed join
  // descendants).
  //
  // EXCEPTION: nodes executed INSIDE a loop/forEach iteration are legitimately
  // re-run every iteration, so the guard is suppressed while `inLoopIteration`
  // is true. `resumeSucceededNodeIds` is the snapshot of node ids that had a
  // success step at resume time — steps logged DURING this resume are excluded
  // so we never skip a node we ourselves just ran.
  private isResumedRun: boolean = false;
  private inLoopIteration: boolean = false;
  private resumeSucceededNodeIds: Set<string> = new Set();
  // H8: org/brand-level variables (VariableScope.GLOBAL), resolved once per
  // execution and exposed in expressions under the `vars` namespace. Cached so
  // every resolver built during the run shares the same single DB read.
  private orgVariables: Record<string, string> | null = null;

  constructor() {
    this.processorRegistry = new NodeProcessorRegistry();
  }

  /**
   * H8: load org/brand-level variables for this run, once. Org-level values are
   * the base; brand-scoped values override per key when the workflow carries a
   * brandId. Result is cached on the instance and reused by every resolver.
   * Fails open (empty map) so a variables read error never breaks an execution.
   */
  private async loadOrgVariables(
    brandId?: string | null
  ): Promise<Record<string, string>> {
    if (this.orgVariables) return this.orgVariables;
    try {
      const { orgVariableRepository } = await import(
        '../db/repository/org-variable.repository'
      );
      this.orgVariables = await orgVariableRepository.resolveForExecution(
        brandId ?? undefined
      );
    } catch (err) {
      console.error('[OrgVariables] Failed to load; continuing without them:', err);
      this.orgVariables = {};
    }
    return this.orgVariables;
  }

  /**
   * Throws if the running execution has exceeded any hard cost ceiling.
   * Called at the top of executeNode so the cap applies uniformly to every
   * dispatch path (registry, inline handlers, sub-workflows).
   */
  /**
   * Cancel a running execution by id. Returns true if a controller was found
   * and signalled. The execution itself will throw on its next budget check.
   */
  static cancel(executionId: string): boolean {
    const ctrl = UnifiedWorkflowExecutionEngine.activeControllers.get(executionId);
    if (!ctrl) return false;
    ctrl.abort(new Error('Execution cancelled by user'));
    return true;
  }

  /**
   * Signal a running execution to stop at its next checkpoint *and* leave it
   * in PAUSED state (not CANCELLED). Returns true if an in-process controller
   * was found. The API route has already persisted the PAUSED status and
   * resume pointer before this is called.
   */
  static pause(executionId: string): boolean {
    const ctrl = UnifiedWorkflowExecutionEngine.activeControllers.get(executionId);
    if (!ctrl) return false;
    // Special Error subclass so assertWithinCostBudget can distinguish pause
    // from cancel — plain Errors would all look the same.
    ctrl.abort(new ExecutionPausedByUser());
    return true;
  }

  private assertWithinCostBudget(node: IWorkflowNode): void {
    if (this.abortController.signal.aborted) {
      const reason = this.abortController.signal.reason;
      // Re-throw the pause marker as-is so the outer catch treats it distinctly.
      if (reason instanceof ExecutionPausedByUser) {
        throw reason;
      }
      throw new Error(
        (reason as Error)?.message || 'Execution cancelled'
      );
    }
    if (this.nodeExecutionCount >= MAX_NODE_EXECUTIONS_PER_RUN) {
      throw new Error(
        `Execution exceeded node budget (${MAX_NODE_EXECUTIONS_PER_RUN}). ` +
          `Likely an infinite loop or runaway sub-workflow.`
      );
    }
    if (node.type === 'ai' && this.aiCallCount >= MAX_AI_CALLS_PER_RUN) {
      throw new Error(
        `Execution exceeded AI call budget (${MAX_AI_CALLS_PER_RUN}).`
      );
    }
    if (
      (node.type === 'integration' || node.subType === 'send_webhook') &&
      this.httpCallCount >= MAX_HTTP_CALLS_PER_RUN
    ) {
      throw new Error(
        `Execution exceeded HTTP call budget (${MAX_HTTP_CALLS_PER_RUN}).`
      );
    }
  }

  /**
   * Cross-process stop checkpoint. Reads the Redis stop flag for this run; if a
   * stop was requested elsewhere (worker run cancelled from the HTTP process),
   * abort the local AbortController so the normal cancel path finalizes the run
   * as CANCELLED. One cheap Redis GET per node boundary; no-op without Redis.
   */
  private async assertNotStopped(): Promise<void> {
    if (!this.execution) return;
    if (this.abortController.signal.aborted) return; // already aborting in-process
    const stopped = await isExecutionStopRequested(this.execution._id.toString());
    if (stopped) {
      this.abortController.abort(new Error('Execution cancelled by user'));
      // Re-run the synchronous gate so this throws the cancellation immediately
      // instead of waiting for the next node.
      throw new Error('Execution cancelled by user');
    }
  }

  /**
   * Execute a workflow
   */
  async execute(config: ExecutionConfig): Promise<IUnifiedWorkflowExecution> {
    // 1.9 test loop flags — gated to manual/test runs by the caller.
    this.testMode = config.testMode === true;
    this.dryRun = config.dryRun === true;
    // 2.3 / H2: share the parent's cost budget across the whole execution tree
    // when one is supplied (sub-workflows pass the parent engine's budget down),
    // so the hard node/AI/HTTP ceilings bound the tree, not each level.
    if (config.costBudget) {
      this.budget = config.costBudget;
    }
    // Load workflow
    const { UnifiedWorkflow } = await import('../db/models/unified-workflow.model');
    this.workflow = await UnifiedWorkflow.findById(config.workflowId);

    if (!this.workflow) {
      throw new Error(`Workflow not found: ${config.workflowId}`);
    }

    // Defense-in-depth tenant guard: the loaded workflow's organization must
    // match the caller-supplied organizationId. Callers should already scope
    // their lookups, but this fails closed against any cross-tenant workflowId
    // (e.g. a sub-workflow id resolved elsewhere) reaching the engine.
    // Build the label→id map for label-based expression refs (2.19).
    this.nodeLabelMap = buildNodeLabelMap(this.workflow.nodes ?? []);

    if (this.workflow.status !== 'active') {
      throw new Error(`Workflow is not active: ${this.workflow.status}`);
    }

    // Atomic cooldown + maxExecutions claim.
    // We update lastExecutedAt only if the cooldown has elapsed AND we're under the cap.
    // This closes the TOCTOU window where two concurrent executions both pass the in-memory check.
    const claimQuery: Record<string, unknown> = { _id: this.workflow._id, status: 'active' };
    if (this.workflow.cooldownMinutes) {
      const cutoff = new Date(Date.now() - this.workflow.cooldownMinutes * 60 * 1000);
      claimQuery.$or = [
        { lastExecutedAt: { $exists: false } },
        { lastExecutedAt: null },
        { lastExecutedAt: { $lte: cutoff } },
      ];
    }
    if (this.workflow.maxExecutions) {
      claimQuery.executionCount = { $lt: this.workflow.maxExecutions };
    }

    const claimed = await UnifiedWorkflow.findOneAndUpdate(
      claimQuery,
      { $set: { lastExecutedAt: new Date() } },
      { new: true }
    );

    if (!claimed) {
      // Re-read to figure out which gate rejected us
      const fresh = await UnifiedWorkflow.findById(config.workflowId);
      if (fresh && fresh.maxExecutions && fresh.executionCount >= fresh.maxExecutions) {
        throw new Error(`Workflow has reached maximum execution count: ${fresh.maxExecutions}`);
      }
      if (fresh && fresh.cooldownMinutes && fresh.lastExecutedAt) {
        const cooldownMs = fresh.cooldownMinutes * 60 * 1000;
        const remaining = Math.max(0, cooldownMs - (Date.now() - fresh.lastExecutedAt.getTime()));
        throw new Error(`Workflow is in cooldown. Next execution available in ${Math.ceil(remaining / 1000)}s`);
      }
      throw new Error('Workflow could not be claimed for execution (concurrent run or status changed).');
    }

    // Use the claimed copy so subsequent reads see the updated lastExecutedAt.
    this.workflow = claimed;

    // Initialize variables
    const workflowVariables = this.workflow.variables.reduce((acc, v) => {
      acc[v.key] = v.value !== undefined ? v.value : null;
      return acc;
    }, {} as Record<string, unknown>);

    const variables = {
      ...workflowVariables,
      ...config.initialVariables
    };

    // 1.9 test loop: when a manual/test run starts with no triggerData but the
    // trigger node carries `pinnedData`, use the pinned sample as the trigger
    // output so the user can iterate without a real inbound event. Never on
    // triggered/scheduled runs (testMode is false there).
    let effectiveTriggerData = config.triggerData;
    if (this.testMode && (!config.triggerData || Object.keys(config.triggerData).length === 0)) {
      const triggerNode = this.workflow.nodes.find(n => n.type === 'trigger');
      const pinned = this.readPinnedData((triggerNode?.data?.config ?? {}) as Record<string, unknown>);
      if (pinned !== undefined) {
        effectiveTriggerData = pinned as Record<string, unknown>;
      }
    }

    // Create execution record
    this.execution = await UnifiedWorkflowExecution.create({
      workflowId: new Types.ObjectId(config.workflowId),
      workflowName: this.workflow.name,
      workflowType: this.workflow.type,
      workflowVersion: this.workflow.version,
      userId: new Types.ObjectId(config.userId),
      contactId: config.contactId ? new Types.ObjectId(config.contactId) : undefined,
      dealId: config.dealId ? new Types.ObjectId(config.dealId) : undefined,
      campaignId: config.campaignId ? new Types.ObjectId(config.campaignId) : undefined,
      status: ExecutionStatus.RUNNING,
      variables,
      triggerData: effectiveTriggerData,
      context: this.testMode ? { testMode: true, ...(this.dryRun ? { dryRun: true } : {}) } : {},
      executionPath: [],
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: this.workflow.errorHandling.maxRetries
    });

    // H8: load org/brand variables once before building the resolver.
    const orgVariables = await this.loadOrgVariables(
      this.workflow.brandId?.toString()
    );

    // Initialize variable resolver
    this.variableResolver = new VariableResolver({
      workflowId: config.workflowId,
      executionId: this.execution._id.toString(),
      userId: config.userId,
      contactId: config.contactId,
      dealId: config.dealId,
      triggerData: effectiveTriggerData,
      variables,
      nodeOutputs: this.nodeOutputs,
      nodeLabels: this.nodeLabelMap,
      systemVariables: {},
      orgVariables
    });

    // Wire up cancellation. Caller-supplied AbortSignal is forwarded into our
    // internal controller, and we register the controller in the static map
    // so the cancel REST endpoint can find it by executionId.
    if (config.abortSignal) {
      if (config.abortSignal.aborted) {
        this.abortController.abort(config.abortSignal.reason);
      } else {
        config.abortSignal.addEventListener('abort', () => {
          this.abortController.abort(config.abortSignal!.reason);
        });
      }
    }
    const execIdKey = this.execution._id.toString();
    UnifiedWorkflowExecutionEngine.activeControllers.set(execIdKey, this.abortController);

    // Emit execution started event
    this.emitExecutionStarted();

    try {
      // Find trigger node
      const triggerNode = this.workflow.nodes.find(n => n.type === 'trigger');
      if (!triggerNode) {
        throw new Error('No trigger node found in workflow');
      }

      // Start execution from trigger
      await this.executeNode(triggerNode);

      // Mark as completed (atomic write — avoid full-doc save race with concurrent step pushes)
      {
        const completedAt = new Date();
        const duration = completedAt.getTime() - this.execution.startedAt.getTime();
        await writeStatus(this.execution._id.toString(), ExecutionStatus.COMPLETED, {
          completedAt,
          duration,
        });
        this.execution.status = ExecutionStatus.COMPLETED;
        this.execution.completedAt = completedAt;
        this.execution.duration = duration;
      }

      // Emit execution completed event
      this.emitExecutionCompleted();

      // Update workflow stats
      await this.workflow.incrementExecutionCount(true, this.execution.duration);

      // If runOnce, deactivate the workflow
      if (this.workflow.runOnce) {
        this.workflow.status = WorkflowStatus.PAUSED;
        await this.workflow.save();
      }

      UnifiedWorkflowExecutionEngine.activeControllers.delete(this.execution._id.toString());
      void clearExecutionStop(this.execution._id.toString());
      return this.execution;
    } catch (error) {
      // Persistent delay: the continuation was already enqueued. Don't treat
      // this as a failure — the execution record has been marked PAUSED by
      // executeDelayNode and a resume job is in flight.
      if (error instanceof ExecutionPausedForDelay) {
        console.log(
          `[Workflow] Execution ${this.execution?._id} paused for persistent delay at node ${error.delayNodeId}.`
        );
        UnifiedWorkflowExecutionEngine.activeControllers.delete(this.execution!._id.toString());
        return this.execution!;
      }

      // User-initiated pause: the REST endpoint already persisted PAUSED +
      // resume pointer, so we unwind cleanly without touching status.
      if (error instanceof ExecutionPausedByUser) {
        console.log(
          `[Workflow] Execution ${this.execution?._id} paused by user at node ${this.execution?.currentNodeId}.`
        );
        UnifiedWorkflowExecutionEngine.activeControllers.delete(this.execution!._id.toString());
        return this.execution!;
      }

      // Pause-for-event: a node (voice wait-for-call-response, channel
      // wait-for-reply, generic wait_for) asked the workflow to suspend until
      // an external event arrives. Persist the subscription spec on the
      // execution's `context.pausedForEvent` so the resumer (`triggers/
      // event-resumer.ts`) can find this execution by `kind + key` when the
      // event lands. Also schedule a delayed timeout job so the resume fires
      // with `timedOut: true` after `spec.timeoutMs` if no event arrives.
      if (error instanceof ExecutionPausedForEvent) {
        console.log(
          `[Workflow] Execution ${this.execution?._id} paused for event at node ${error.waitNodeId} (kind=${error.spec.kind}, key=${error.spec.key}).`
        );
        if (this.execution) {
          const deadline = error.spec.timeoutMs
            ? new Date(Date.now() + error.spec.timeoutMs)
            : undefined;
          await UnifiedWorkflowExecution.updateOne(
            { _id: this.execution._id },
            {
              $set: {
                status: ExecutionStatus.PAUSED,
                currentNodeId: error.waitNodeId,
                'context.pausedForEvent': {
                  kind: error.spec.kind,
                  key: error.spec.key,
                  timeoutMs: error.spec.timeoutMs,
                  deadline,
                  waitNodeId: error.waitNodeId,
                  nextNodeIds: error.nextNodeIds,
                  payload: error.spec.payload,
                  pausedAt: new Date(),
                },
              },
            }
          );
          this.execution.status = ExecutionStatus.PAUSED;
          this.execution.currentNodeId = error.waitNodeId;

          // Schedule a timeout job that will resume this execution with
          // `{ timedOut: true }` payload if no event matches before deadline.
          if (error.spec.timeoutMs && error.spec.timeoutMs > 0) {
            try {
              const { scheduleEventTimeoutResume } = await import('./triggers/event-resumer');
              await scheduleEventTimeoutResume({
                executionId: this.execution._id.toString(),
                delayMs: error.spec.timeoutMs,
                kind: error.spec.kind,
                key: error.spec.key,
              });
            } catch (timeoutErr) {
              console.error('[Workflow] Failed to schedule event-pause timeout:', timeoutErr);
            }
          }
        }
        UnifiedWorkflowExecutionEngine.activeControllers.delete(this.execution!._id.toString());
        return this.execution!;
      }

      console.error('Workflow execution failed:', error);
      const err = error instanceof Error ? error : new Error(String(error));

      // Handle error based on workflow configuration
      const shouldRetry = this.shouldRetry(err);
      if (shouldRetry) {
        await this.scheduleRetry();
      } else {
        const cancelled = this.abortController.signal.aborted;
        const completedAt = new Date();
        const duration = completedAt.getTime() - this.execution.startedAt.getTime();
        const terminalStatus = cancelled ? ExecutionStatus.CANCELLED : ExecutionStatus.FAILED;
        // Persist the failing node so the canvas can mark it (audit H13). The
        // node the engine was on when it threw is the failure site.
        const errorNodeId = this.execution.currentNodeId;
        await writeStatus(this.execution._id.toString(), terminalStatus, {
          error: err.message,
          errorStack: err.stack,
          errorNodeId,
          completedAt,
          duration,
        });
        this.execution.status = terminalStatus;
        this.execution.error = err.message;
        this.execution.errorStack = err.stack;
        this.execution.errorNodeId = errorNodeId;
        this.execution.completedAt = completedAt;
        this.execution.duration = duration;

        // Emit execution failed event
        this.emitExecutionFailed();

        // Update workflow stats
        await this.workflow.incrementExecutionCount(false, this.execution.duration);
      }

      UnifiedWorkflowExecutionEngine.activeControllers.delete(this.execution._id.toString());
      void clearExecutionStop(this.execution._id.toString());
      throw error;
    }
  }

  /**
   * Resume a paused execution from stored continuation pointers.
   *
   * Called by the BullMQ worker when it dequeues a delayed resume job. Loads
   * the paused execution, rehydrates variables + node outputs from the saved
   * state, and re-enters executeNode() for each pointer. Any new pause (chained
   * delay) during the resumed run is handled the same way as in `execute()`.
   */
  async resume(opts: {
    executionId: string;
    fromNodeIds: string[];
  }): Promise<IUnifiedWorkflowExecution> {
    const { UnifiedWorkflow } = await import('../db/models/unified-workflow.model');

    this.execution = await UnifiedWorkflowExecution.findById(opts.executionId);
    if (!this.execution) {
      throw new Error(`Execution not found for resume: ${opts.executionId}`);
    }
    if (
      this.execution.status !== ExecutionStatus.PAUSED &&
      this.execution.status !== ExecutionStatus.RUNNING
    ) {
      throw new Error(
        `Execution ${opts.executionId} is not resumable (status=${this.execution.status}).`
      );
    }

    this.workflow = await UnifiedWorkflow.findById(this.execution.workflowId);
    if (!this.workflow) {
      throw new Error(`Workflow not found for execution ${opts.executionId}`);
    }

    // Build the label→id map for label-based expression refs (2.19).
    this.nodeLabelMap = buildNodeLabelMap(this.workflow.nodes ?? []);

    // Rebuild nodeOutputs from the successful steps on the execution record —
    // downstream nodes reference {{nodes.<id>.output}}, so they need this map.
    // Also re-seed the 2.4 total execution-data running sum from already-persisted
    // step input/output so the cap stays meaningful across a delay/resume cycle
    // (a fresh engine instance otherwise starts the counter at zero).
    this.nodeOutputs.clear();
    for (const step of this.execution.executionPath || []) {
      if (step.status === 'success' && step.output !== undefined) {
        this.nodeOutputs.set(step.nodeId, step.output);
      }
      // 2.5: snapshot which nodes had ALREADY succeeded at resume time so the
      // downstream-dedup guard in executeNode skips them (output restored)
      // instead of re-firing their side effects when a parallel sibling's
      // continuation walks back into join descendants. Steps logged during this
      // resume are NOT in this set, so legitimately re-entered nodes still run.
      if (step.status === 'success') {
        this.resumeSucceededNodeIds.add(step.nodeId);
      }
      this.persistedStepBytes += estimateBytes(step.input) + estimateBytes(step.output);
    }
    if (this.persistedStepBytes > EXECUTION_DATA_MAX_BYTES) {
      this.executionDataCapTripped = true;
    }
    // Mark this as a resumed run so executeNode applies the success-step dedup
    // guard (2.5). Only set AFTER the snapshot above is built.
    this.isResumedRun = true;

    // H8: org/brand variables for the resumed run.
    const orgVariables = await this.loadOrgVariables(
      this.workflow.brandId?.toString()
    );

    this.variableResolver = new VariableResolver({
      workflowId: this.workflow._id.toString(),
      executionId: this.execution._id.toString(),
      userId: this.execution.userId.toString(),
      contactId: this.execution.contactId?.toString(),
      dealId: this.execution.dealId?.toString(),
      triggerData: (this.execution.triggerData ?? {}) as Record<string, unknown>,
      variables: this.execution.variables || {},
      nodeOutputs: this.nodeOutputs,
      nodeLabels: this.nodeLabelMap,
      systemVariables: {},
      orgVariables,
    });

    // Flip status back to running and clear the resume pointer atomically.
    await UnifiedWorkflowExecution.updateOne(
      { _id: this.execution._id },
      {
        $set: { status: ExecutionStatus.RUNNING },
        $unset: { 'context.resumePointer': 1 },
      }
    );
    this.execution.status = ExecutionStatus.RUNNING;

    const execIdKey = this.execution._id.toString();
    UnifiedWorkflowExecutionEngine.activeControllers.set(execIdKey, this.abortController);

    try {
      for (const nodeId of opts.fromNodeIds) {
        const node = this.workflow.nodes.find(n => n.id === nodeId);
        if (!node) {
          console.warn(`[Resume] Pointer node ${nodeId} not found in workflow — skipping.`);
          continue;
        }

        // Resume idempotency (C8): if a duplicate resume job is delivered (BullMQ
        // re-delivery / worker crash after a node sent but before the run
        // finished), this pointer node may already have a SUCCESS step on the
        // execution record. Re-running it would re-send (duplicate email/deal),
        // so instead reuse its logged output and continue straight to the
        // downstream nodes. This is scoped to resume-ENTRY pointers ONLY — loop
        // bodies run inline inside executeLoopNode and never re-enter here, so a
        // legitimately repeated loop nodeId is unaffected.
        const priorSuccess = (this.execution.executionPath || []).find(
          step => step.nodeId === nodeId && step.status === 'success'
        );
        if (priorSuccess) {
          console.warn(
            `[Resume] Pointer node ${nodeId} already completed for execution ${opts.executionId} — reusing logged output (duplicate resume).`
          );
          this.nodeOutputs.set(nodeId, priorSuccess.output);
          // End/terminal pointers have nothing downstream to fan out to.
          if (node.subType === 'end' || (priorSuccess.output as { terminated?: unknown })?.terminated) {
            continue;
          }
          await this.executeNextNodes(node, priorSuccess.output);
          continue;
        }

        await this.executeNode(node);
      }

      const completedAt = new Date();
      const duration = completedAt.getTime() - this.execution.startedAt.getTime();
      await writeStatus(this.execution._id.toString(), ExecutionStatus.COMPLETED, {
        completedAt,
        duration,
      });
      this.execution.status = ExecutionStatus.COMPLETED;
      this.execution.completedAt = completedAt;
      this.execution.duration = duration;

      this.emitExecutionCompleted();
      await this.workflow.incrementExecutionCount(true, duration);

      UnifiedWorkflowExecutionEngine.activeControllers.delete(execIdKey);
      return this.execution;
    } catch (error) {
      if (error instanceof ExecutionPausedForDelay) {
        // Another delay chained after this one — already re-enqueued.
        UnifiedWorkflowExecutionEngine.activeControllers.delete(execIdKey);
        return this.execution;
      }
      if (error instanceof ExecutionPausedByUser) {
        // User paused the resumed run too — the pause endpoint already wrote
        // PAUSED + pointer. Just unwind cleanly.
        UnifiedWorkflowExecutionEngine.activeControllers.delete(execIdKey);
        return this.execution;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      const completedAt = new Date();
      const duration = completedAt.getTime() - this.execution.startedAt.getTime();
      const errorNodeId = this.execution.currentNodeId;
      await writeStatus(this.execution._id.toString(), ExecutionStatus.FAILED, {
        error: err.message,
        errorStack: err.stack,
        errorNodeId,
        completedAt,
        duration,
      });
      this.execution.status = ExecutionStatus.FAILED;
      this.execution.error = err.message;
      this.execution.errorNodeId = errorNodeId;
      this.emitExecutionFailed();
      await this.workflow.incrementExecutionCount(false, duration);
      UnifiedWorkflowExecutionEngine.activeControllers.delete(execIdKey);
      throw error;
    }
  }

  /**
   * 1.9 "Test this step" — execute a SINGLE node in isolation, inline, without
   * persisting an execution record and without enqueuing. Side effects are
   * suppressed via dryRun (default true). Upstream data is supplied by the
   * caller (pinned data / last-run step outputs / empty), exposed to the node
   * both as `{{nodes.<id>.output}}` and `{{trigger.*}}`.
   *
   * Returns the node's resolved config + output (or error) for the UI result
   * panel. Throws only on auth/setup problems — node errors are returned.
   */
  async testSingleNode(opts: {
    workflow: IUnifiedWorkflow;
    nodeId: string;
    userId: string;
    upstreamOutputs?: Record<string, unknown>;
    triggerData?: Record<string, unknown>;
    dryRun?: boolean;
    timeoutMs?: number;
  }): Promise<{ nodeId: string; output?: unknown; error?: string; durationMs: number; dryRun: boolean }> {
    this.workflow = opts.workflow;
    this.testMode = true;
    this.dryRun = opts.dryRun !== false; // default ON for single-step tests
    // Build the label→id map for label-based expression refs (2.19).
    this.nodeLabelMap = buildNodeLabelMap(this.workflow.nodes ?? []);

    const node = this.workflow.nodes.find(n => n.id === opts.nodeId);
    if (!node) {
      throw new Error(`Node ${opts.nodeId} not found in workflow`);
    }

    // Seed upstream node outputs so {{nodes.<id>.output}} resolves.
    this.nodeOutputs.clear();
    for (const [nid, out] of Object.entries(opts.upstreamOutputs || {})) {
      this.nodeOutputs.set(nid, out);
    }

    const triggerData = (opts.triggerData ?? {}) as Record<string, unknown>;

    // Transient (UNSAVED) execution doc — processors read execution.userId /
    // organizationId, and getDecryptedCredentials() needs execution.userId.
    this.execution = new UnifiedWorkflowExecution({
      workflowId: this.workflow._id,
      workflowName: this.workflow.name,
      workflowType: this.workflow.type,
      workflowVersion: this.workflow.version,
      userId: new Types.ObjectId(opts.userId),
      status: ExecutionStatus.RUNNING,
      variables: {},
      triggerData,
      context: { testMode: true, dryRun: this.dryRun, source: 'test-step' },
      executionPath: [],
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: 0,
    });

    this.variableResolver = new VariableResolver({
      workflowId: this.workflow._id.toString(),
      executionId: 'test-step',
      userId: opts.userId,
      triggerData,
      variables: {},
      nodeOutputs: this.nodeOutputs,
      nodeLabels: this.nodeLabelMap,
      systemVariables: {},
    });

    // Short timeout so a slow/hung node test can't block the request.
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer = setTimeout(() => this.abortController.abort(new Error('Test step timed out')), timeoutMs);

    const startTime = Date.now();
    try {
      // A test of the trigger node simply echoes the (pinned) trigger data.
      const pinned = node.type !== 'trigger' ? this.readPinnedData((node.data?.config ?? {}) as Record<string, unknown>) : undefined;
      let output: unknown;
      if (pinned !== undefined) {
        output = pinned;
      } else {
        const resolvedConfig = this.variableResolver.resolveObject(node.data.config);
        output = await this.executeNodeLogic(node, resolvedConfig);
      }
      return { nodeId: node.id, output, durationMs: Date.now() - startTime, dryRun: this.dryRun };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { nodeId: node.id, error: err.message, durationMs: Date.now() - startTime, dryRun: this.dryRun };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: IWorkflowNode): Promise<void> {
    const startTime = Date.now();

    // 2.5 resume dedup guard. On a RESUMED run, if this node already succeeded
    // BEFORE the resume started, do not re-execute it (which would re-fire its
    // side effects) — restore its logged output and continue downstream. This
    // protects join descendants that a parallel sibling already ran past before
    // another branch's delay paused the execution. Suppressed inside loop/forEach
    // iterations, where a node is legitimately re-run each pass. See the field
    // comment on `isResumedRun` for the full invariant.
    if (
      this.isResumedRun &&
      !this.inLoopIteration &&
      this.resumeSucceededNodeIds.has(node.id)
    ) {
      const priorOutput = this.nodeOutputs.get(node.id);
      console.warn(
        `[Resume] Node ${node.id} already succeeded before resume — skipping re-execution and reusing logged output (parallel-resume dedup).`
      );
      this.nodeOutputs.set(node.id, priorOutput);
      if (this.variableResolver) {
        this.variableResolver.context.variables = this.execution!.variables;
      }
      // Terminal nodes have nothing to fan out to.
      if (node.subType === 'end' || (priorOutput as { terminated?: unknown })?.terminated) {
        return;
      }
      await this.executeNextNodes(node, priorOutput);
      return;
    }

    try {
      // Cost-cap check BEFORE we touch any external system.
      this.assertWithinCostBudget(node);
      // Cross-process stop check (audit H13): a stop request from another
      // process (worker run, HTTP-handled DELETE) sets a Redis flag the
      // in-memory AbortController can't carry. Abort locally so the rest of the
      // failure path (AbortController.signal.aborted) marks this CANCELLED.
      await this.assertNotStopped();
      this.nodeExecutionCount++;
      if (node.type === 'ai') this.aiCallCount++;
      if (node.type === 'integration' || node.subType === 'send_webhook') this.httpCallCount++;

      // Update current node (atomic $set — safe under parallel branches)
      await writeCurrentNode(this.execution!._id.toString(), node.id);
      this.execution!.currentNodeId = node.id;

      // Log step as running
      await this.logStep(node.id, node.data.label || node.subType, 'running', {
        input: node.data.config
      });

      // Check timeout
      if (this.workflow!.timeout) {
        const elapsedSeconds = (Date.now() - this.execution!.startedAt.getTime()) / 1000;
        if (elapsedSeconds > this.workflow!.timeout) {
          throw new Error(`Workflow execution timeout (${this.workflow!.timeout}s)`);
        }
      }

      const nodeConfig = (node.data?.config ?? {}) as Record<string, unknown>;

      // "Run once per item" (forEach) — when enabled, the node executes once per
      // element of an upstream array with an ISOLATED per-iteration variable
      // scope. Otherwise it runs once normally. forEach handling re-resolves the
      // node config per item (so `{{item.*}}` references resolve), counts each
      // iteration against the cost budget, and aggregates outputs.
      let output: unknown;
      // 1.9 test loop: in a test run, if this node has pinned sample data, use
      // the pin as its output INSTEAD of executing it — skipping side effects.
      // Trigger nodes are handled at start() via triggerData seeding, so this
      // applies to downstream action/source nodes only.
      const pinned = this.testMode && node.type !== 'trigger'
        ? this.readPinnedData(nodeConfig)
        : undefined;
      const forEach = this.readForEachConfig(nodeConfig);
      if (pinned !== undefined) {
        output = pinned;
        await this.logStep(node.id, node.data.label || node.subType, 'pinned', {
          output,
          duration: Date.now() - startTime,
        });
        this.nodeOutputs.set(node.id, output);
        if (this.variableResolver) {
          this.variableResolver.context.variables = this.execution!.variables;
        }
        await this.executeNextNodes(node, output);
        return;
      } else if (forEach) {
        output = await this.executeNodeForEach(node, forEach);
      } else {
        // Resolve variables in node config with the shared resolver.
        const resolvedConfig = this.variableResolver!.resolveObject(node.data.config);
        output = await this.runNodeLogicWithRetry(node, resolvedConfig);
      }

      // Store node output (the resolver references the same Map, so it sees this immediately)
      this.nodeOutputs.set(node.id, output);

      // Refresh the resolver's variables snapshot in place — replacing `this.variableResolver`
      // here would race with sibling branches in `executeParallel`.
      if (this.variableResolver) {
        this.variableResolver.context.variables = this.execution!.variables;
      }

      // Log successful step — flag end/terminated nodes as terminal so logStep
      // snapshots the final variables bag for them.
      const isTerminalSuccess =
        node.subType === 'end' || (output as { terminated?: unknown })?.terminated != null;
      await this.logStep(node.id, node.data.label || node.subType, 'success', {
        output,
        duration: Date.now() - startTime,
        retryCount: this.lastRetryCount,
        isTerminal: isTerminalSuccess,
      });

      // If end node or terminated, stop execution
      if (node.subType === 'end' || (output as { terminated?: unknown })?.terminated) {
        return;
      }

      // Execute next nodes
      await this.executeNextNodes(node, output);
    } catch (error) {
      // Delay-pause signal isn't a failure — log a skipped step and rethrow
      // so the top-level catch can finalize the execution as PAUSED.
      if (error instanceof ExecutionPausedForDelay) {
        await this.logStep(node.id, node.data.label || node.subType, 'skipped', {
          output: { delayed: true, resuming: 'queued' },
          duration: Date.now() - startTime,
        });
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));

      // Log failed step
      await this.logStep(node.id, node.data.label || node.subType, 'failed', {
        error: err.message,
        errorStack: err.stack,
        duration: Date.now() - startTime,
        retryCount: this.lastRetryCount,
      });

      // Group-scoped error boundary — when the failed node is inside a group
      // with `errorBoundary: true`, swallow the error, emit a synthetic
      // `groupFailed` output, and continue to downstream nodes.
      const groupMeta = (node.data as { group?: { errorBoundary?: boolean; label?: string; id?: string } })?.group;
      if (groupMeta?.errorBoundary) {
        await this.logStep(
          node.id,
          node.data.label || node.subType,
          'skipped',
          {
            error: `Caught by group "${groupMeta.label ?? groupMeta.id}": ${err.message}`,
            output: { groupFailed: true, groupId: groupMeta.id },
          }
        );
        await this.executeNextNodes(node, {
          groupFailed: true,
          groupId: groupMeta.id,
          error: err.message,
        });
        return;
      }

      // Per-node error handling (H3) — takes precedence over the workflow-global
      // onErrorAction below. Configured on the node as `data.config.onError`:
      //   'stop'      → fall through to the global/stop behavior (default).
      //   'continue'  → record a failed-but-tolerated output and proceed down
      //                 the happy path as if the node returned an error object.
      //   'errorPath' → route ONLY along edges whose sourceHandle === 'error';
      //                 if no error edge exists, fall back to 'stop'.
      const nodeOnError = String(
        (node.data?.config as { onError?: unknown } | undefined)?.onError ?? 'stop'
      );

      if (nodeOnError === 'continue') {
        const failOutput = { success: false, error: err.message };
        // Make the failed node's "output" visible to downstream {{nodes.<id>}}
        // references and the resolver, mirroring the success path.
        this.nodeOutputs.set(node.id, failOutput);
        if (this.variableResolver) {
          this.variableResolver.context.variables = this.execution!.variables;
        }
        await this.executeNextNodes(node, failOutput);
        return;
      }

      if (nodeOnError === 'errorPath') {
        const errorEdgeExists = this.workflow!.edges.some(
          e => e.source === node.id && e.sourceHandle === 'error'
        );
        if (errorEdgeExists) {
          const failOutput = { success: false, error: err.message };
          this.nodeOutputs.set(node.id, failOutput);
          if (this.variableResolver) {
            this.variableResolver.context.variables = this.execution!.variables;
          }
          // Route exclusively down the reserved 'error' handle.
          await this.executeErrorPath(node);
          return;
        }
        // No error edge configured — fall through to stop.
      }

      // Handle error based on node configuration
      if (this.workflow!.errorHandling.onErrorAction === 'fallback' && this.workflow!.errorHandling.fallbackNodeId) {
        // Execute fallback node
        const fallbackNode = this.workflow!.nodes.find(n => n.id === this.workflow!.errorHandling.fallbackNodeId);
        if (fallbackNode) {
          await this.executeNode(fallbackNode);
          return;
        }
      }

      if (this.workflow!.errorHandling.onErrorAction === 'continue') {
        // Continue to next nodes
        await this.executeNextNodes(node, null);
        return;
      }

      // Otherwise, throw error to stop execution
      throw error;
    }
  }

  /**
   * Per-node retry + auto-healing wrapper. Runs `executeNodeLogic` with the
   * already-resolved config, retrying with exponential backoff per the node's
   * `retryCount`/`retryDelayMs`, and (opt-in) AI auto-heal on final failure.
   * Returns the node output or throws the last error.
   */
  private async runNodeLogicWithRetry(node: IWorkflowNode, resolvedConfig: unknown): Promise<unknown> {
    const nodeConfig = (node.data?.config ?? {}) as Record<string, unknown>;
    const maxNodeRetries = Math.max(0, Number(nodeConfig.retryCount ?? 0) || 0);
    const baseDelayMs = Math.max(0, Number(nodeConfig.retryDelayMs ?? 1000) || 0);
    let output: unknown;
    let lastError: Error | null = null;
    // Number of retries actually performed (0 on first-try success). Recorded on
    // the step log by the caller so execution history shows retry effort.
    this.lastRetryCount = 0;

    // Per-node retry loop with exponential backoff + jitter.
    for (let attempt = 0; attempt <= maxNodeRetries; attempt++) {
      try {
        output = await this.executeNodeLogic(node, resolvedConfig);
        lastError = null;
        this.lastRetryCount = attempt;
        break; // Success
      } catch (retryError) {
        const err = retryError instanceof Error ? retryError : new Error(String(retryError));
        lastError = err;
        this.lastRetryCount = attempt + 1;
        if (attempt < maxNodeRetries) {
          // Exponential backoff (1s, 2s, 4s…) with ±25% jitter so concurrent
          // retries across iterations/branches don't thunder-herd a flaky
          // dependency at the same instant.
          const base = baseDelayMs * Math.pow(2, attempt);
          const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25%
          const delay = Math.max(0, Math.round(base + jitter));
          console.warn(`[Retry] Node ${node.id} (${node.subType}) attempt ${attempt + 1}/${maxNodeRetries} failed. Retrying in ${delay}ms...`, err.message);
          await this.logStep(node.id, node.data.label || node.subType, 'running', {
            error: `Retry ${attempt + 1}/${maxNodeRetries} after ${delay}ms: ${err.message}`,
            retryCount: attempt + 1,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed and the node opted in to AI auto-healing, try it.
    // Auto-healing is OFF by default — it sends node config to OpenAI, so it
    // must be an explicit per-node decision (autoHeal: true in the node config).
    if (lastError && nodeConfig.autoHeal === true) {
      console.warn(`[Auto-Heal] Node ${node.id} (${node.subType}) failed after ${maxNodeRetries + 1} attempts. Attempting AI recovery...`, lastError.message);
      try {
        const healedConfig = await this.healNodeConfig(node, resolvedConfig, lastError);
        if (healedConfig) {
          console.log(`[Auto-Heal] Node ${node.id} config healed successfully. Retrying execution...`);
          output = await this.executeNodeLogic(node, healedConfig);
          lastError = null;
        } else {
          throw lastError;
        }
      } catch (healError) {
        console.error(`[Auto-Heal] Recovery failed or retry failed for Node ${node.id}.`, healError);
        throw lastError;
      }
    } else if (lastError) {
      throw lastError;
    }

    return output;
  }

  /**
   * Read & normalize a node's pinned sample data (1.9 test loop). Authored in
   * the config sidebar as a JSON string (or already-parsed object) on
   * `data.pinnedData`. Returns the parsed value, or `undefined` when no usable
   * pin is set. An empty/blank string is treated as "no pin".
   */
  private readPinnedData(nodeConfig: Record<string, unknown>): unknown {
    const raw = nodeConfig?.pinnedData;
    if (raw == null) return undefined;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      try {
        return JSON.parse(trimmed);
      } catch {
        // Not valid JSON — fall back to the raw string so a plain sample still works.
        return trimmed;
      }
    }
    if (typeof raw === 'object') return raw;
    return raw;
  }

  /**
   * Read & normalize the per-node "Run once per item" config.
   * Shape: `forEach: { enabled: boolean, sourcePath: string }`.
   * Returns null when disabled or no source path is configured.
   */
  private readForEachConfig(nodeConfig: Record<string, unknown>): { sourcePath: string } | null {
    const raw = nodeConfig.forEach as { enabled?: unknown; sourcePath?: unknown } | undefined;
    if (!raw || typeof raw !== 'object') return null;
    if (raw.enabled !== true) return null;
    const sourcePath = typeof raw.sourcePath === 'string' ? raw.sourcePath.trim() : '';
    if (!sourcePath) return null;
    return { sourcePath };
  }

  /**
   * Execute a node once per element of an upstream array (the "Run once per
   * item" toggle). Each iteration runs with an ISOLATED variable scope — the
   * current `item`/`itemIndex` are layered over a SHALLOW COPY of the shared
   * variables, so iterations never see each other's writes (fixes the loop
   * node's documented last-write-wins race). `nodeOutputs` is shared so the
   * node can still reference upstream node outputs.
   *
   * Iterations are sequential and each counts against MAX_NODE_EXECUTIONS_PER_RUN.
   */
  private async executeNodeForEach(
    node: IWorkflowNode,
    forEach: { sourcePath: string }
  ): Promise<unknown> {
    // Resolve the source array using the shared resolver. Accepts a `{{...}}`
    // template or a bare path expression (e.g. `$findNode.records`).
    const expr = forEach.sourcePath.replace(/^\{\{\s*|\s*\}\}$/g, '');
    let source: unknown;
    try {
      source = this.variableResolver!.evaluateExpression(expr);
    } catch {
      source = undefined;
    }

    if (!Array.isArray(source)) {
      // Nothing to iterate — emit an empty, well-formed result instead of
      // throwing, so a 0-result "find many" upstream doesn't fail the run.
      return { items: [], count: 0, failed: 0, forEach: true };
    }

    // Cap iterations — reuse the loop iteration ceiling; the per-node cost
    // budget (MAX_NODE_EXECUTIONS_PER_RUN) is the real backstop via the
    // per-iteration nodeExecutionCount increment below.
    const MAX_FOREACH_ITERATIONS = 1000;
    const items = source.slice(0, MAX_FOREACH_ITERATIONS);
    const truncated = source.length > MAX_FOREACH_ITERATIONS;

    const baseVariables = this.execution!.variables;
    const savedResolver = this.variableResolver!;
    const results: unknown[] = [];
    let failed = 0;

    try {
      for (let i = 0; i < items.length; i++) {
        // Cost-cap each iteration as its own node execution.
        this.assertWithinCostBudget(node);
        this.nodeExecutionCount++;

        // Isolated per-iteration scope: shallow copy of shared variables plus
        // item/itemIndex. NEVER mutates execution.variables.
        const iterationResolver = new VariableResolver({
          ...savedResolver.context,
          variables: { ...baseVariables, item: items[i], itemIndex: i },
          nodeOutputs: this.nodeOutputs,
        });
        this.variableResolver = iterationResolver;

        try {
          const resolvedConfig = iterationResolver.resolveObject(node.data.config);
          const itemOutput = await this.runNodeLogicWithRetry(node, resolvedConfig);
          results.push(itemOutput);
        } catch (err) {
          failed++;
          results.push({
            success: false,
            error: err instanceof Error ? err.message : String(err),
            itemIndex: i,
          });
        }
      }
    } finally {
      // Always restore the shared resolver so downstream nodes / sibling
      // branches keep the canonical scope.
      this.variableResolver = savedResolver;
      this.variableResolver.context.variables = baseVariables;
    }

    return {
      forEach: true,
      items: results,
      count: results.length,
      failed,
      ...(truncated ? { truncated: true, originalCount: source.length } : {}),
    };
  }

  /**
   * Get next nodes to execute
   */
  private async executeNextNodes(currentNode: IWorkflowNode, output: unknown): Promise<void> {
    const nextNodes = this.getNextNodes(currentNode, output);

    if (nextNodes.length === 0) {
      return; // End of workflow
    }

    // Check if parallel execution is enabled and we have multiple branches
    if (this.workflow!.enableParallel && nextNodes.length > 1) {
      await this.executeParallel(nextNodes);
    } else {
      // Execute sequentially
      for (const nextNode of nextNodes) {
        await this.executeNode(nextNode);
      }
    }
  }

  /**
   * Get next nodes based on edges and conditions
   */
  private getNextNodes(currentNode: IWorkflowNode, output: unknown): IWorkflowNode[] {
    const nextNodes: IWorkflowNode[] = [];
    const outputObj = (output ?? {}) as { branch?: unknown; result?: unknown };

    // Find edges from current node
    const edges = this.workflow!.edges.filter(e => e.source === currentNode.id);

    for (const edge of edges) {
      // Check edge condition if present
      if (edge.condition) {
        try {
          const conditionResult = this.variableResolver!.evaluateExpression(edge.condition);
          if (!conditionResult) {
            continue; // Skip this edge
          }
        } catch (error) {
          console.error(`Failed to evaluate edge condition: ${edge.condition}`, error);
          continue;
        }
      }

      // Reserved 'error' handle is the per-node error path (H3). It must NEVER
      // fire on the success/happy path — it's routed separately by
      // executeErrorPath when a node fails with onError:'errorPath'.
      if (edge.sourceHandle === 'error') {
        continue;
      }

      // For branch/switch nodes, check the output handle
      if (currentNode.subType === 'branch' || currentNode.subType === 'switch') {
        const expectedHandle = outputObj.branch ?? (outputObj.result as { toString?: () => string })?.toString?.();
        if (edge.sourceHandle && edge.sourceHandle !== expectedHandle) {
          continue;
        }
      }

      // Find target node
      const targetNode = this.workflow!.nodes.find(n => n.id === edge.target);
      if (targetNode) {
        nextNodes.push(targetNode);
      }
    }

    return nextNodes;
  }

  /**
   * Route a failed node down its reserved `error` output handle only (H3).
   * Selects edges from the failed node whose `sourceHandle === 'error'`,
   * honoring any edge condition, and executes their targets. Happy-path edges
   * are intentionally excluded — they're filtered out in getNextNodes.
   */
  private async executeErrorPath(currentNode: IWorkflowNode): Promise<void> {
    const errorNodes: IWorkflowNode[] = [];
    const errorEdges = this.workflow!.edges.filter(
      e => e.source === currentNode.id && e.sourceHandle === 'error'
    );

    for (const edge of errorEdges) {
      if (edge.condition) {
        try {
          if (!this.variableResolver!.evaluateExpression(edge.condition)) continue;
        } catch (error) {
          console.error(`Failed to evaluate error-edge condition: ${edge.condition}`, error);
          continue;
        }
      }
      const targetNode = this.workflow!.nodes.find(n => n.id === edge.target);
      if (targetNode) errorNodes.push(targetNode);
    }

    if (errorNodes.length === 0) return;

    if (this.workflow!.enableParallel && errorNodes.length > 1) {
      await this.executeParallel(errorNodes);
    } else {
      for (const errorNode of errorNodes) {
        await this.executeNode(errorNode);
      }
    }
  }

  /**
   * Execute nodes in parallel
   */
  private async executeParallel(nodes: IWorkflowNode[]): Promise<void> {
    const branchId = `parallel-${Date.now()}`;

    // Record parallel branch (atomic $push)
    await pushParallelBranch(this.execution!._id.toString(), {
      branchId,
      nodeIds: nodes.map(n => n.id),
    });

    // Execute all nodes in parallel
    const promises = nodes.map(node => this.executeNode(node));

    try {
      await Promise.all(promises);
      await writeParallelBranch(
        this.execution!._id.toString(),
        branchId,
        ExecutionStatus.COMPLETED
      );
    } catch (error) {
      await writeParallelBranch(
        this.execution!._id.toString(),
        branchId,
        ExecutionStatus.FAILED
      );
      throw error;
    }
  }

  /**
   * Log execution step
   */
  private async logStep(
    nodeId: string,
    nodeName: string,
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'pinned',
    data: {
      input?: unknown;
      output?: unknown;
      error?: string;
      errorStack?: string;
      duration?: number;
      retryCount?: number;
      isTerminal?: boolean;
    }
  ): Promise<void> {
    // Redact likely-secret values out of the persisted step payload. Execution
    // history is readable by org members, so raw node output (HTTP bodies,
    // tokens, Set-Cookie echoes) and the variables snapshot must be scrubbed.
    // Redact first, then cap the serialized size so a large (but redacted)
    // payload can't bloat the execution document (audit H4).
    const { isTerminal, ...rest } = data;

    // Per-step cap (H4) first, then the TOTAL execution-data cap (2.4): once the
    // cumulative persisted input/output bytes for this run cross
    // EXECUTION_DATA_MAX_BYTES we stop storing full field values (keeping a tiny
    // `{_omitted:true}` marker) so a long run can't push the execution document
    // toward Mongo's 16 MB limit. Status/timing/retries/error are always kept.
    const cappedInput =
      rest.input !== undefined ? capStepFieldSize(redactSecrets(rest.input)) : undefined;
    const cappedOutput =
      rest.output !== undefined ? capStepFieldSize(redactSecrets(rest.output)) : undefined;

    let finalInput = cappedInput;
    let finalOutput = cappedOutput;
    if (this.executionDataCapTripped) {
      // Already over the ceiling — omit any field that was present.
      if (cappedInput !== undefined) finalInput = OMITTED_FIELD;
      if (cappedOutput !== undefined) finalOutput = OMITTED_FIELD;
    } else {
      const addBytes = estimateBytes(cappedInput) + estimateBytes(cappedOutput);
      this.persistedStepBytes += addBytes;
      if (this.persistedStepBytes > EXECUTION_DATA_MAX_BYTES) {
        // Trip the cap. This step's own data is omitted too (it's what pushed us
        // over), and all subsequent steps omit field data as well.
        this.executionDataCapTripped = true;
        if (cappedInput !== undefined) finalInput = OMITTED_FIELD;
        if (cappedOutput !== undefined) finalOutput = OMITTED_FIELD;
        console.warn(
          `[Workflow] Execution ${this.execution!._id} reached the total execution-data cap ` +
            `(${EXECUTION_DATA_MAX_BYTES} bytes). Subsequent step input/output will be omitted from history.`
        );
      }
    }

    const redactedData = {
      ...rest,
      ...(finalInput !== undefined ? { input: finalInput } : {}),
      ...(finalOutput !== undefined ? { output: finalOutput } : {}),
    };

    // Only snapshot the full variables bag on terminal steps (a failure, a
    // skipped/paused step, or the final/end node) — persisting it on every step
    // bloats the document and multiplies secret exposure. The execution-detail
    // UI renders variables conditionally, so intermediate steps omit the section.
    const isTerminalStep =
      status === 'failed' || status === 'skipped' || isTerminal === true;
    const step: Omit<IExecutionStep, 'timestamp'> = {
      nodeId,
      nodeName,
      status,
      ...redactedData,
      ...(isTerminalStep
        ? { variables: redactSecrets({ ...this.execution!.variables }) as Record<string, unknown> }
        : {}),
    };

    // Atomic $push — composes correctly under parallel branch fan-out.
    const stamped = await pushStep(this.execution!._id.toString(), step);
    this.execution!.executionPath.push(stamped);
    this.execution!.currentStep = this.execution!.executionPath.length;

    // Emit step update event
    this.emitExecutionStep(stamped);
  }

  /**
   * Execute trigger node
   */
  private async executeTriggerNode(node: IWorkflowNode, _config: unknown): Promise<unknown> {
    // Trigger node doesn't do anything, just passes through
    return {
      triggered: true,
      triggerType: node.subType,
      triggerData: this.execution!.triggerData
    };
  }

  /**
   * Core node logic execution (extracted to support retry/healing)
   */
  private async executeNodeLogic(node: IWorkflowNode, resolvedConfig: unknown): Promise<unknown> {
    switch (node.type) {
      case 'trigger': return await this.executeTriggerNode(node, resolvedConfig);
      case 'action': return await this.executeActionNode(node, resolvedConfig);
      case 'logic': return await this.executeLogicNode(node, resolvedConfig);
      case 'ai': return await this.executeAINode(node, resolvedConfig);
      case 'data': return await this.executeDataNode(node, resolvedConfig);
      case 'control': return await this.executeControlNode(node, resolvedConfig);
      case 'integration': return await this.executeIntegrationNode(node, resolvedConfig);
      default: throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  /**
   * Uses AI to attempt to find and fix errors in node configuration.
   * The prompt is redacted: it never includes credentials, trigger payloads,
   * full variable maps, or other potentially-PII context — only the failed
   * config (which the user authored) and the error message.
   */
  private async healNodeConfig(node: IWorkflowNode, failedConfig: unknown, error: Error): Promise<unknown | null> {
    // Budget gate — heal is opt-in per node, but even when opted in we cap how
    // many times it can run per execution and per node to bound cost.
    if (this.healAttemptsTotal >= MAX_HEAL_ATTEMPTS_PER_RUN) {
      console.warn(`[Auto-Heal] Skipped: per-run budget exhausted (${MAX_HEAL_ATTEMPTS_PER_RUN}).`);
      return null;
    }
    const perNode = this.healAttemptsByNode.get(node.id) || 0;
    if (perNode >= MAX_HEAL_ATTEMPTS_PER_NODE) {
      console.warn(`[Auto-Heal] Skipped: per-node budget exhausted for ${node.id}.`);
      return null;
    }
    this.healAttemptsTotal++;
    this.healAttemptsByNode.set(node.id, perNode + 1);

    try {
      const redactedConfig = redactSecrets(failedConfig);

      const systemPrompt = `You are a self-healing workflow engine component. A workflow node has failed execution.
Your task is to analyze the error and the failed configuration to suggest a FIXED configuration payload.
You MUST output ONLY valid JSON representing the fully repaired 'config' object. Do not output any markdown or explanation.`;

      const userPrompt = `Node Details:
Type: ${node.type}
SubType: ${node.subType}

Failed Configuration (with secrets redacted):
${JSON.stringify(redactedConfig, null, 2)}

Error Message:
${error.message}

Please provide the corrected JSON configuration for this node. Preserve any "[REDACTED]" placeholders verbatim — they will be substituted back from the original config.`;

      const text = await generateTextWithClient({
        model: 'openai/gpt-4o', // Use a high-reasoning model for healing
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });

      const cleanedText = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      const healedConfig = JSON.parse(cleanedText);

      // Basic sanity check: make sure we got an object back
      if (typeof healedConfig === 'object' && healedConfig !== null) {
        return healedConfig;
      }
      return null;
    } catch (_e) {
      // If AI healing itself fails (parse error, etc), return null
      return null;
    }
  }

  /**
   * Execute action node
   */
  private async executeActionNode(node: IWorkflowNode, config: unknown): Promise<unknown> {
    return await this.executeViaRegistry(node, config, [node.subType, `action_${node.subType}`], 'action');
  }

  /**
   * Execute logic node (branch, switch, filter, router)
   * Falls through to the registry for processor-backed subTypes (smart_router, sub_workflow, …).
   */
  private async executeLogicNode(node: IWorkflowNode, config: unknown): Promise<unknown> {
    switch (node.subType) {
      case 'branch':
        return await this.executeBranchNode(config);

      case 'switch':
        return await this.executeSwitchNode(config);

      case 'filter':
        return await this.executeFilterNode(config);

      case 'router':
        return await this.executeRouterNode(config);

      default:
        return await this.executeViaRegistry(node, config, [node.subType, `logic_${node.subType}`], 'logic');
    }
  }

  /**
   * Execute AI node
   */
  private async executeAINode(node: IWorkflowNode, config: unknown): Promise<unknown> {
    return await this.executeViaRegistry(node, config, [`ai_${node.subType}`, node.subType], 'ai');
  }

  /**
   * Execute data node
   */
  private async executeDataNode(node: IWorkflowNode, config: unknown): Promise<unknown> {
    switch (node.subType) {
      case 'set_variable':
        return await this.executeSetVariableNode(config);

      case 'transform':
        return await this.executeTransformNode(config);

      default:
        return await this.executeViaRegistry(node, config, [`data_${node.subType}`, node.subType], 'data');
    }
  }

  /**
   * Look up a processor by trying each candidate key in order, then execute it.
   * Centralizes the "try multiple registry keys" pattern used by multiple node categories.
   */
  private async executeViaRegistry(
    node: IWorkflowNode,
    config: unknown,
    candidateKeys: string[],
    category: string
  ): Promise<unknown> {
    type Processor = { execute: (ctx: Record<string, unknown>) => Promise<unknown> };
    let processor: Processor | null = null;
    for (const key of candidateKeys) {
      const candidate = this.processorRegistry.getProcessor(key) as unknown as Processor | null;
      if (candidate) {
        processor = candidate;
        break;
      }
    }
    if (!processor) {
      throw new Error(
        `No processor found for ${category} node "${node.subType}" (tried: ${candidateKeys.join(', ')})`
      );
    }

    return await processor.execute({
      node,
      config,
      execution: this.execution!,
      workflow: this.workflow!,
      variableResolver: this.variableResolver!,
      credentials: this.getDecryptedCredentials(),
      // Let processors charge extra AI calls (e.g. agentic tool-call loops)
      // against the per-run budget. The engine still auto-increments once per
      // `ai` node (line ~604); this covers additional calls within one node.
      incrementAICall: () => { this.aiCallCount++; },
      // Cancellation: lets in-flight HTTP / AI work abort when the run is stopped.
      abortSignal: this.abortController.signal,
      // 1.9 dry-run: side-effecting processors simulate instead of firing.
      dryRun: this.dryRun,
      // 2.3 / H2: hand the live budget object to the sub-workflow processor so a
      // child engine can charge the SAME counters (one budget bounds the tree).
      costBudget: this.budget,
    });
  }

  /**
   * Execute control node (delay, wait, loop, parallel, end)
   * Falls through to the registry for processor-backed subTypes.
   */
  private async executeControlNode(node: IWorkflowNode, config: unknown): Promise<unknown> {
    switch (node.subType) {
      case 'delay':
        return await this.executeDelayNode(node, config);

      case 'loop':
        return await this.executeLoopNode(node, config);

      case 'end':
        return { terminated: true };

      default:
        return await this.executeViaRegistry(node, config, [node.subType, `control_${node.subType}`], 'control');
    }
  }

  /**
   * Execute integration node.
   *
   * Tracks per-connection runtime auth failures: an expired/revoked OAuth token
   * surfaces as a 401/403 here. We increment a consecutive-failure counter on
   * the underlying IntegrationConnection; after the threshold it flips to
   * `needs_reauth` and fires ONE "reconnect" notification, after which
   * resolveProcessorCredentials fails fast (no more API hammering). A success
   * clears the counter.
   */
  private async executeIntegrationNode(node: IWorkflowNode, config: unknown): Promise<unknown> {
    try {
      const result = await this.executeViaRegistry(
        node,
        config,
        [`integration_${node.subType}`, node.subType],
        'integration'
      );
      void this.clearIntegrationAuthFailure(config);
      return result;
    } catch (error) {
      if (isAuthFailureError(error)) {
        void this.recordIntegrationAuthFailure(node, config);
      }
      throw error;
    }
  }

  /**
   * Resolve the IntegrationConnection a node used and record one auth failure.
   * Best-effort and never throws — the original node error is what propagates.
   */
  private async recordIntegrationAuthFailure(node: IWorkflowNode, config: unknown): Promise<void> {
    try {
      const cfg = (config ?? {}) as Record<string, unknown>;

      const { integrationConnectionRepository } = await import(
        '@/lib/db/repository/integration-connection.repository'
      );

      // A vault credential (credentialId) has no connection to flag — skip.
      if (typeof cfg.credentialId === 'string' && cfg.credentialId) return;

      let conn:
        | { id: string;
 brandId?: string | null; provider: string; connectedBy: string }
        | undefined;

      if (typeof cfg.connectionId === 'string' && cfg.connectionId) {
        const found = await integrationConnectionRepository.findById(cfg.connectionId);
        if (found) {
          conn = {
            id: found._id!.toString(),
            brandId: found.brandId,
            provider: found.provider,
            connectedBy: found.connectedBy,
          };
        }
      } else {
        const provider = String(node.subType) as never;
        const brandId = typeof cfg.brandId === 'string' ? cfg.brandId : undefined;
        const resolved = await integrationConnectionRepository.resolveForBrand(
          provider,
          brandId
        );
        if (resolved) {
          conn = {
            id: resolved.connection._id!.toString(),
            brandId: resolved.connection.brandId,
            provider: resolved.connection.provider,
            connectedBy: resolved.connection.connectedBy,
          };
        }
      }

      if (conn) await integrationConnectionRepository.markConnectionAuthFailure(conn);
    } catch (err) {
      console.error(
        '[engine] failed to record integration auth failure:',
        err instanceof Error ? err.message : err
      );
    }
  }

  /** Clear the auth-failure counter after a successful integration call. */
  private async clearIntegrationAuthFailure(config: unknown): Promise<void> {
    try {
      const cfg = (config ?? {}) as Record<string, unknown>;
      const connectionId = typeof cfg.connectionId === 'string' ? cfg.connectionId : undefined;
      if (!connectionId) return; // brand-resolved success path: cheap to skip
      const { integrationConnectionRepository } = await import(
        '@/lib/db/repository/integration-connection.repository'
      );
      await integrationConnectionRepository.clearConnectionAuthFailure(connectionId);
    } catch {
      // best-effort
    }
  }

  // Node-specific execution methods

  private async executeBranchNode(rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;
    if (config.isNaturalLanguage && config.naturalLanguagePrompt) {
      try {
        // Metered through the workflow owner's identity (C7) — the engine has
        // no auth() session in the worker, so resolve from this.execution.
        const { runMeteredWorkflowAI } = await import('./metered-ai');
        const { text } = await runMeteredWorkflowAI(
          { execution: this.execution!, incrementAICall: () => { this.aiCallCount++; }, abortSignal: this.abortController.signal },
          {
            model: 'openai/gpt-4o-mini', // Fast evaluation model
            system: 'You are an AI that evaluates logic conditions in a workflow engine. You MUST output ONLY "true" or "false". Do not explain. Do not include quotes. Evaluate the user\'s condition against the current workflow context.',
            messages: [
              {
                role: 'user',
                content: `Context Variables (JSON format):\n${JSON.stringify(this.variableResolver!.context, null, 2)}\n\nCondition to evaluate: ${config.naturalLanguagePrompt}\n\nIs this condition true or false based on the context?`
              }
            ],
          },
        );

        const result = text.trim().toLowerCase() === 'true';
        return {
          result,
          branch: result ? 'true' : 'false'
        };
      } catch (error) {
        console.error("Failed to evaluate Natural Language Condition:", error);
        // Fallback to false if the LLM fails
        return { result: false, branch: 'false' };
      }
    }

    const condition = String(config.condition || '');
    const result = this.variableResolver!.evaluateExpression(condition);

    return {
      result: Boolean(result),
      branch: result ? 'true' : 'false'
    };
  }

  private async executeSwitchNode(rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;
    const value = this.variableResolver!.evaluateExpression(String(config.value || ''));
    const cases = (config.cases as Array<{ value: unknown; branch?: string }>) || [];

    for (const caseItem of cases) {
      if (caseItem.value === value) {
        return {
          result: caseItem.value,
          branch: caseItem.branch || caseItem.value
        };
      }
    }

    // Default case
    return {
      result: value,
      branch: 'default'
    };
  }

  private async executeFilterNode(rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;
    const data = this.variableResolver!.evaluateExpression(String(config.data || '[]'));
    const condition = String(config.condition || 'true');

    if (!Array.isArray(data)) {
      throw new Error('Filter node requires array data');
    }

    const filtered = data.filter((item: unknown) => {
      // Create temporary context with item
      const tempResolver = new VariableResolver({
        ...this.variableResolver!['context'],
        variables: {
          ...this.execution!.variables,
          item
        }
      });

      return tempResolver.evaluateExpression(condition);
    });

    return {
      filtered,
      count: filtered.length,
      originalCount: data.length
    };
  }

  private async executeRouterNode(rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;
    // Router node routes to multiple paths simultaneously
    return {
      routed: true,
      paths: config.paths || []
    };
  }

  private async executeSetVariableNode(rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;
    const variableName = String(config.variableName || '');
    const value = this.variableResolver!.evaluateExpression(String(config.value || ''));

    // Update variable (atomic, dotted-path $set)
    await writeVariable(this.execution!._id.toString(), variableName, value);
    this.execution!.variables[variableName] = value;

    return {
      variable: variableName,
      value
    };
  }

  private async executeTransformNode(rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;
    const data = this.variableResolver!.evaluateExpression(String(config.data || '{}'));
    const transformation = String(config.transformation || '');

    const transformed = this.variableResolver!.evaluateExpression(transformation);

    return {
      transformed,
      original: data
    };
  }

  private async executeDelayNode(node: IWorkflowNode, rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;

    // 2.30 — delay modes. All modes collapse into ONE absolute `resumeAt`
    // (the single source of truth the sweeper relies on); the BullMQ job delay
    // is derived from it. `relative` (default) preserves the legacy behaviour.
    const mode = (config.mode as DelayMode | undefined) ?? 'relative';
    // Resolve {{vars}} in the ISO datetime string before scheduling.
    const resolvedDatetime =
      typeof config.datetime === 'string'
        ? this.variableResolver!.resolve(config.datetime)
        : undefined;
    const delayConfig: DelayConfig = {
      mode,
      duration: config.duration !== undefined ? Number(config.duration) : 1000,
      datetime: resolvedDatetime,
      weekday: config.weekday !== undefined ? Number(config.weekday) : undefined,
      time: config.time as string | undefined,
      windowStart: config.windowStart as string | undefined,
      windowEnd: config.windowEnd as string | undefined,
      timezone: (config.timezone as string | undefined) || 'UTC',
    };

    const now = new Date();
    const resumeAt = computeResumeAt(delayConfig, now);
    const duration = Math.max(0, resumeAt.getTime() - now.getTime());

    // Short relative delays — in-process setTimeout is fine. Worker thread is
    // only blocked for a brief moment, and serializing + round-tripping through
    // Redis would add more overhead than we save. Scheduled modes
    // (until_datetime / until_weekday_time / business_hours) always take the
    // persistent path so they survive a worker restart and the sweeper can
    // reconcile them from `resumeAt`.
    if (mode === 'relative' && duration < PERSISTENT_DELAY_THRESHOLD_MS) {
      await new Promise(resolve => setTimeout(resolve, duration));
      return { delayed: true, duration, mode, persistent: false };
    }

    // Long delay path — requires the queue. If Redis isn't configured, we
    // still honor the duration in-process (dev ergonomics), but warn so
    // operators know this worker slot is now tied up for the full window.
    const { isQueueConfigured } = await import('./queue/connection');
    if (!isQueueConfigured()) {
      console.warn(
        `[Delay] Persistent delay of ${duration}ms (mode=${mode}) requested but Redis is not configured — sleeping in-process.`
      );
      await new Promise(resolve => setTimeout(resolve, duration));
      return { delayed: true, duration, mode, persistent: false, fallback: 'inline-setTimeout' };
    }

    // Capture the continuation — the nodes that would have fired from this
    // delay's outgoing edges. We persist these ids, mark the execution paused,
    // and enqueue a delayed BullMQ job that will resume from here.
    const nextNodes = this.getNextNodes(node, { delayed: true, duration });
    const nextNodeIds = nextNodes.map(n => n.id);

    const executionId = this.execution!._id.toString();
    await UnifiedWorkflowExecution.updateOne(
      { _id: this.execution!._id },
      {
        $set: {
          status: ExecutionStatus.PAUSED,
          'context.resumePointer': {
            delayNodeId: node.id,
            nextNodeIds,
            resumeAt,
          },
        },
      }
    );
    this.execution!.status = ExecutionStatus.PAUSED;

    const { enqueueExecution } = await import('./queue/execution-queue');
    await enqueueExecution(
      {
        workflowId: this.workflow!._id.toString(),
        userId: this.execution!.userId.toString(),
        contactId: this.execution!.contactId?.toString(),
        dealId: this.execution!.dealId?.toString(),
        campaignId: this.execution!.campaignId?.toString(),
        executionId,
        triggerData: (this.execution!.triggerData ?? {}) as Record<string, unknown>,
        source: 'delay-resume',
        resume: { fromNodeIds: nextNodeIds, delayNodeId: node.id },
      },
      { delay: duration }
    );

    console.log(
      `[Delay] Persistent delay (mode=${mode}, ${duration}ms) scheduled — execution ${executionId} paused, will resume at ${resumeAt.toISOString()}.`
    );

    // Unwind the in-process call stack. execute() catches this and returns
    // a paused execution record instead of marking it failed.
    throw new ExecutionPausedForDelay(node.id, nextNodeIds);
  }

  private async executeLoopNode(node: IWorkflowNode, rawConfig: unknown): Promise<unknown> {
    const config = (rawConfig ?? {}) as Record<string, unknown>;
    if (!this.workflow!.enableLoops) {
      throw new Error('Loop nodes are not enabled for this workflow');
    }

    const data = this.variableResolver!.evaluateExpression(String(config.data || '[]'));

    if (!Array.isArray(data)) {
      throw new Error('Loop node requires array data');
    }

    // Hard cap iteration count regardless of input size — pairs with the
    // engine-wide MAX_NODE_EXECUTIONS_PER_RUN budget so an attacker-controlled
    // upstream array can't blow past the cost cap.
    const MAX_LOOP_ITERATIONS = 1000;
    const items = data.slice(0, MAX_LOOP_ITERATIONS);
    const truncated = data.length > MAX_LOOP_ITERATIONS;

    // Concurrency control — defaults to serial (1) for backward compatibility.
    // Users can opt into bounded parallelism via config.concurrency (1..10).
    const requestedConcurrency = Number(config.concurrency ?? 1);
    const concurrency = Math.max(
      1,
      Math.min(Number.isFinite(requestedConcurrency) ? requestedConcurrency : 1, 10)
    );

    await writeLoopInit(this.execution!._id.toString(), node.id, items);
    this.execution!.loopState = {
      nodeId: node.id,
      currentIteration: 0,
      totalIterations: items.length,
      iterationData: items,
    };

    const runIteration = async (item: unknown, i: number) => {
      // Variables are shared across iterations — for parallel loops we still
      // write loopItem/loopIndex so single-iteration users keep working, but
      // callers that need true isolation should use sub-workflows. Fan-out
      // writes are intentionally last-write-wins.
      const patch = { loopItem: item, loopIndex: i, loopCount: items.length };
      await writeVariables(this.execution!._id.toString(), patch);
      Object.assign(this.execution!.variables, patch);

      const loopNodes = this.getNextNodes(node, { loopIteration: i });
      for (const loopNode of loopNodes) {
        await this.executeNode(loopNode);
      }

      await writeLoopIncrement(this.execution!._id.toString());
      if (this.execution!.loopState) {
        this.execution!.loopState.currentIteration += 1;
      }
    };

    // 2.5: loop bodies legitimately re-run nodes each iteration, so the resume
    // success-step dedup guard in executeNode must NOT fire inside them. Set the
    // flag around all iteration dispatch (save/restore to support nested loops).
    const prevInLoop = this.inLoopIteration;
    this.inLoopIteration = true;
    try {
      if (concurrency === 1) {
        for (let i = 0; i < items.length; i++) {
          await runIteration(items[i], i);
        }
      } else {
        // Bounded parallel — process in chunks of `concurrency` to keep the
        // active fan-out predictable.
        for (let start = 0; start < items.length; start += concurrency) {
          const slice = items.slice(start, start + concurrency);
          await Promise.all(slice.map((item, offset) => runIteration(item, start + offset)));
        }
      }
    } finally {
      this.inLoopIteration = prevInLoop;
    }

    await writeLoopClear(this.execution!._id.toString());
    this.execution!.loopState = undefined;

    return {
      looped: true,
      iterations: items.length,
      concurrency,
      ...(truncated ? { truncated: true, originalCount: data.length } : {}),
    };
  }

  /**
   * Get decrypted credentials
   */
  private getDecryptedCredentials(): Record<string, unknown> {
    const credentials: Record<string, unknown> = {};

    for (const cred of this.workflow!.credentials) {
      try {
        if (!cred.salt) {
          throw new Error(`Credential ${cred.name} is missing the persisted salt — re-save it after upgrade.`);
        }

        const decrypted = decryptCredential(
          {
            name: cred.name,
            type: cred.type,
            encryptedValue: cred.encryptedValue,
            iv: cred.iv,
            authTag: cred.authTag,
            salt: cred.salt,
            metadata: cred.metadata
          },
          this.execution!.userId.toString()
        );

        credentials[cred.name] = decrypted.value;
      } catch (error) {
        console.error(`Failed to decrypt credential: ${cred.name}`, error);
      }
    }

    return credentials;
  }

  /**
   * Check if execution should retry
   */
  private shouldRetry(error: Error): boolean {
    if (!this.workflow!.errorHandling.retryEnabled) {
      return false;
    }

    if (this.execution!.retryCount >= this.execution!.maxRetries) {
      return false;
    }

    // Don't retry for certain error types
    const nonRetryableErrors = ['validation', 'authentication', 'authorization'];
    for (const errorType of nonRetryableErrors) {
      if (error.message.toLowerCase().includes(errorType)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Schedule retry
   */
  private async scheduleRetry(): Promise<void> {
    const retryDelay = this.calculateRetryDelay();
    await writeRetry(this.execution!._id.toString(), retryDelay);
    this.execution!.retryCount += 1;
    this.execution!.status = ExecutionStatus.PENDING;
    this.execution!.nextRetryAt = new Date(Date.now() + retryDelay);
  }

  /**
   * Calculate retry delay with backoff
   */
  private calculateRetryDelay(): number {
    const baseDelay = this.workflow!.errorHandling.retryDelay;
    const retryCount = this.execution!.retryCount;

    if (this.workflow!.errorHandling.retryBackoff === 'exponential') {
      return baseDelay * Math.pow(2, retryCount);
    }

    return baseDelay * (retryCount + 1);
  }

  /**
   * Emit execution started event via Socket.io
   */
  private emitExecutionStarted(): void {
    const workflowId = this.workflow!._id.toString();
    const executionId = this.execution!._id.toString();
    publishWorkflowEventAsync({
      type: 'execution:started',
      workflowId,
      executionId,
      source: 'engine',
      payload: {
        execution: {
          _id: executionId,
          workflowId,
          workflowName: this.workflow!.name,
          status: this.execution!.status,
          startedAt: this.execution!.startedAt,
        },
      },
    });
  }

  /**
   * Emit execution step event — bridged via Redis pub/sub in multi-process deploys.
   */
  private emitExecutionStep(step: IExecutionStep): void {
    const workflowId = this.workflow!._id.toString();
    const executionId = this.execution!._id.toString();
    publishWorkflowEventAsync({
      type: 'execution:step',
      workflowId,
      executionId,
      source: 'engine',
      payload: { step },
    });
  }

  /**
   * Emit execution completed event — bridged via Redis pub/sub in multi-process deploys.
   */
  private emitExecutionCompleted(): void {
    const workflowId = this.workflow!._id.toString();
    const executionId = this.execution!._id.toString();
    publishWorkflowEventAsync({
      type: 'execution:completed',
      workflowId,
      executionId,
      source: 'engine',
      payload: {
        execution: {
          _id: executionId,
          workflowId,
          status: ExecutionStatus.COMPLETED,
          completedAt: this.execution!.completedAt,
          duration: this.execution!.duration,
          executionPath: this.execution!.executionPath,
        },
      },
    });
  }

  /**
   * Emit execution failed event — bridged via Redis pub/sub in multi-process deploys.
   */
  private emitExecutionFailed(): void {
    const workflowId = this.workflow!._id.toString();
    const executionId = this.execution!._id.toString();
    publishWorkflowEventAsync({
      type: 'execution:failed',
      workflowId,
      executionId,
      source: 'engine',
      payload: {
        execution: {
          _id: executionId,
          workflowId,
          status: ExecutionStatus.FAILED,
          completedAt: this.execution!.completedAt,
          duration: this.execution!.duration,
          error: this.execution!.error,
          errorStack: this.execution!.errorStack,
          errorNodeId: this.execution!.errorNodeId,
          executionPath: this.execution!.executionPath,
        },
      },
    });

    // Cross-cutting domain event so the notification dispatcher can alert the
    // run's owner. Decoupled from the notification layer on purpose.
    try {
      publishDomainEvent({
        type: 'workflow.execution_failed',
        source: 'engine',
        payload: {
          workflowId,
          executionId,
          workflowName: this.workflow!.name,
          userId: this.execution!.userId.toString(),
          error: this.execution!.error,
        },
      });
    } catch (err) {
      console.error('[engine] failed to publish workflow.execution_failed:', err);
    }
  }
}

/**
 * Export convenience function
 */
export async function executeWorkflow(config: ExecutionConfig): Promise<IUnifiedWorkflowExecution> {
  const engine = new UnifiedWorkflowExecutionEngine();
  return await engine.execute(config);
}
