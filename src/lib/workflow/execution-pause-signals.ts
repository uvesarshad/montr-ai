/**
 * Pause signals raised by node processors to suspend a running workflow.
 *
 * Lives in its own file (not inside `unified-execution-engine.ts`) so that
 * node processors and tests can `import { ExecutionPausedForEvent } from ...`
 * without pulling the entire engine + its dependency tree (auth, AI flows,
 * model imports) into the module graph.
 *
 * The engine re-exports these for backward compatibility — callers should
 * prefer importing directly from this module.
 */

export class ExecutionPausedForDelay extends Error {
  readonly nextNodeIds: string[];
  readonly delayNodeId: string;
  constructor(delayNodeId: string, nextNodeIds: string[]) {
    super(`Execution paused for delay at node ${delayNodeId}`);
    this.name = 'ExecutionPausedForDelay';
    this.delayNodeId = delayNodeId;
    this.nextNodeIds = nextNodeIds;
  }
}

export class ExecutionPausedByUser extends Error {
  constructor(message: string = 'Execution paused by user') {
    super(message);
    this.name = 'ExecutionPausedByUser';
  }
}

/**
 * Pause-for-event marker (B2-NEW.4 / voice V-6.4).
 *
 * Raised by node processors that need to suspend the workflow until an
 * external event arrives (inbound call, channel reply, webhook with a
 * matching key). The engine treats this like `ExecutionPausedForDelay` —
 * write a PAUSED status with a resume pointer + the event subscription
 * spec; the event-resumer (`triggers/event-resumer.ts`) matches incoming
 * events against the spec and re-enqueues the run with the matched payload
 * bound to the waiting node's output variable.
 */
export class ExecutionPausedForEvent extends Error {
  readonly nextNodeIds: string[];
  readonly waitNodeId: string;
  readonly spec: {
    kind: string;
    /** Free-form match key — provider sets it (contactId / phone / threadId / etc). */
    key?: string;
    /** Timeout in ms; the engine schedules a timeout job that resumes with `timedOut: true`. */
    timeoutMs?: number;
    /** Provider-specific payload (channel list, etc). */
    payload?: Record<string, unknown>;
  };
  constructor(
    waitNodeId: string,
    nextNodeIds: string[],
    spec: ExecutionPausedForEvent['spec']
  ) {
    super(`Execution paused for event at node ${waitNodeId} (kind=${spec.kind})`);
    this.name = 'ExecutionPausedForEvent';
    this.waitNodeId = waitNodeId;
    this.nextNodeIds = nextNodeIds;
    this.spec = spec;
  }
}
