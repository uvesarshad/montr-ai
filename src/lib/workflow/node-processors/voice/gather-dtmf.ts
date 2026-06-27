/**
 * Workflow node: gather-dtmf (keypad / IVR).
 *
 * Pauses the run until the caller presses keypad digits during a live call, or
 * `maxWaitSec` elapses, then branches on the pressed digits. Built on the
 * engine's `ExecutionPausedForEvent` primitive — no polling — exactly like
 * `wait-for-call-response.ts`. Twilio `Digits` arrive normalized as a
 * `dtmf.received` VoiceEvent; the webhook receiver re-emits them as a free-form
 * `voice.dtmf_received` resume event keyed by contactId. The kind-agnostic
 * `event-resumer` matches `pausedForEvent.kind + key` and resumes this node.
 *
 * Branching: the engine routes outbound edges by matching `edge.sourceHandle`
 * to this node output's `branch` field. So downstream edges set `sourceHandle`
 * to the digit string (e.g. "1") or "timeout".
 *
 * On resume:
 *   - Match path:   `{ matched: true, digits, branch: <digits> }`
 *   - Timeout path: `{ matched: false, timedOut: true, branch: 'timeout' }`
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { ExecutionPausedForEvent } from '../../execution-pause-signals';

const DEFAULT_MAX_WAIT_SEC = 30;

interface GatherDtmfOutput {
  matched: boolean;
  digits?: string;
  numDigits?: number;
  timedOut?: boolean;
  timeoutSec?: number;
  /** Routing key — the engine matches this against edge.sourceHandle. */
  branch: string;
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

/** Coerce a number-or-numeric-string config value, falling back to a default. */
function coerceSeconds(raw: unknown, fallback: number): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class GatherDtmfProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { node, config, execution, workflow } = context;

    const contactId =
      (typeof config.contactId === 'string' && config.contactId.trim() !== ''
        ? config.contactId
        : undefined) ?? execution.contactId?.toString();
    if (!contactId) {
      throw new Error('gather-dtmf requires a contactId');
    }

    const maxWaitSec = coerceSeconds(config.maxWaitSec, DEFAULT_MAX_WAIT_SEC);
    const numDigits =
      typeof config.numDigits === 'number'
        ? config.numDigits
        : typeof config.numDigits === 'string' && config.numDigits.trim() !== ''
          ? Number(config.numDigits)
          : undefined;

    // Resume path: the event-resumer pre-populated context.eventResume.<nodeId>
    // before re-enqueuing. Read it, normalize, and return — the engine routes
    // outbound edges on `branch` (sourceHandle = digits or "timeout").
    const eventResumeBag = (execution.context as { eventResume?: Record<string, EventResumeShape> })?.eventResume;
    const bound = eventResumeBag?.[node.id];
    if (bound) {
      if (bound.timedOut === true) {
        const result: GatherDtmfOutput = {
          matched: false,
          timedOut: true,
          timeoutSec: bound.timeoutSec ?? maxWaitSec,
          branch: 'timeout',
        };
        return result as unknown as Record<string, unknown>;
      }
      const digits =
        typeof bound.payload?.digits === 'string' ? bound.payload.digits : '';
      const result: GatherDtmfOutput = {
        matched: true,
        digits,
        numDigits: Number.isFinite(numDigits) ? numDigits : undefined,
        branch: digits,
      };
      return result as unknown as Record<string, unknown>;
    }

    // First entry — pause for the keypad event. Walk the workflow's edges from
    // this node to figure out which downstream nodes to enqueue on resume.
    const nextNodeIds = (workflow.edges ?? [])
      .filter(e => e.source === node.id)
      .map(e => e.target);

    throw new ExecutionPausedForEvent(node.id, nextNodeIds, {
      kind: 'voice.dtmf_received',
      key: contactId,
      timeoutMs: maxWaitSec * 1000,
    });
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    // contactId may be supplied here or resolved from the triggering contact at
    // runtime (execution.contactId). Only flag a clearly-bad maxWaitSec.
    if (
      config.maxWaitSec !== undefined &&
      config.maxWaitSec !== '' &&
      !Number.isFinite(
        typeof config.maxWaitSec === 'number' ? config.maxWaitSec : Number(config.maxWaitSec),
      )
    ) {
      errors.push('`maxWaitSec` must be a number of seconds');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
