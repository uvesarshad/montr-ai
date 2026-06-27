/**
 * Workflow node: wait-for-call-response (V-6.4).
 *
 * Pauses the run until a `call_completed` event lands for the contact, or
 * `maxWaitSec` elapses. Uses the engine's `ExecutionPausedForEvent` primitive
 * (B2-NEW.4 / FUP-2) — no polling. The engine persists the subscription
 * spec on the execution doc; `triggers/event-resumer.ts` matches incoming
 * `call_completed` events by `kind + key` (key = contactId) and resumes
 * the workflow with the event payload bound to this node's output.
 *
 * On resume:
 *   - Match path:   `{ matched: true, callSessionId, durationSec, disposition }`
 *   - Timeout path: `{ matched: false, timedOut: true, timeoutSec }`
 *
 * The event-resumer pre-binds these onto `context.eventResume.<waitNodeId>`,
 * which the engine reads when resuming. This processor exposes the bound
 * payload as the node output for downstream branches.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { ExecutionPausedForEvent } from '../../execution-pause-signals';

const DEFAULT_MAX_WAIT_SEC = 60 * 5;

interface WaitNodeOutput {
  matched: boolean;
  callSessionId?: string;
  durationSec?: number;
  disposition?: string;
  timedOut?: boolean;
  timeoutSec?: number;
  since?: string;
}

interface EventResumeShape {
  matched?: boolean;
  timedOut?: boolean;
  timeoutSec?: number;
  payload?: Record<string, unknown>;
  eventKind?: string;
  eventKey?: string;
  receivedAt?: Date | string;
}

export class WaitForCallResponseProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { node, config, execution, workflow } = context;

    const contactId =
      (typeof config.contactId === 'string' ? config.contactId : undefined)
      ?? execution.contactId?.toString();
    if (!contactId) {
      throw new Error('wait-for-call-response requires a contactId');
    }

    // Accept a number or a numeric string from the builder input.
    const maxWaitRaw =
      typeof config.maxWaitSec === 'number'
        ? config.maxWaitSec
        : typeof config.maxWaitSec === 'string' && config.maxWaitSec.trim() !== ''
          ? Number(config.maxWaitSec)
          : NaN;
    const maxWaitSec =
      Number.isFinite(maxWaitRaw) && maxWaitRaw > 0 ? maxWaitRaw : DEFAULT_MAX_WAIT_SEC;

    // Resume path: the event-resumer pre-populated context.eventResume.<nodeId>
    // before re-enqueuing. Read it, normalize, and return — downstream nodes
    // branch on `{{$<nodeId>.matched}}` / `.timedOut`.
    const eventResumeBag = (execution.context as { eventResume?: Record<string, EventResumeShape> })?.eventResume;
    const bound = eventResumeBag?.[node.id];
    if (bound) {
      const result: WaitNodeOutput = {
        matched: bound.matched === true,
        timedOut: bound.timedOut === true,
        timeoutSec: bound.timedOut ? (bound.timeoutSec ?? maxWaitSec) : undefined,
        callSessionId: typeof bound.payload?.callSessionId === 'string'
          ? bound.payload.callSessionId
          : undefined,
        durationSec: typeof bound.payload?.durationSec === 'number'
          ? bound.payload.durationSec
          : undefined,
        disposition: typeof bound.payload?.disposition === 'string'
          ? bound.payload.disposition
          : undefined,
      };
      return result as unknown as Record<string, unknown>;
    }

    // First entry — pause for the event. Walk the workflow's edges from this
    // node to figure out which downstream nodes to enqueue on resume.
    const nextNodeIds = (workflow.edges ?? [])
      .filter(e => e.source === node.id)
      .map(e => e.target);

    throw new ExecutionPausedForEvent(node.id, nextNodeIds, {
      kind: 'voice.call_completed',
      key: contactId,
      timeoutMs: maxWaitSec * 1000,
    });
  }
}
