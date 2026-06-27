/**
 * Workflow node: wait-for-channel-response (B3-15 / B2-1.5).
 *
 * Pauses the run until an inbound message arrives on the configured channel
 * for the resolved contact, or `maxWaitSec` elapses. Persists a
 * `pendingResume` spec on the execution doc and throws
 * `ExecutionPausedForEvent` so the engine marks the run PAUSED.
 *
 * The WhatsApp webhook (and inbox / email producers) call
 * `resumePausedExecutionsForChannelMessage` to re-enqueue matching paused
 * runs with the inbound message payload bound to a variable.
 *
 * Modeled directly on voice's `wait-for-call-response` processor.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { ExecutionPausedForEvent } from '../../unified-execution-engine';
import {
  persistChannelPendingResume,
  type ChannelKind,
} from '../../resume-channel';

const DEFAULT_MAX_WAIT_SEC = 60 * 60 * 24; // 24h — typical reminder-cascade reply window.
const ALLOWED_CHANNELS: ChannelKind[] = ['whatsapp', 'email', 'inbox', 'telegram', 'instagram', 'facebook', 'sms'];

export class WaitForChannelResponseProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, workflow, node } = context;

    const contactId =
      (typeof config.contactId === 'string' ? config.contactId : undefined)
      ?? execution.contactId?.toString();
    if (!contactId) {
      throw new Error('wait-for-channel-response requires a contactId');
    }

    const rawChannel = typeof config.channel === 'string' ? config.channel.toLowerCase() : '';
    if (!ALLOWED_CHANNELS.includes(rawChannel as ChannelKind)) {
      throw new Error(
        `wait-for-channel-response requires config.channel — one of ${ALLOWED_CHANNELS.join(', ')}; got ${JSON.stringify(rawChannel)}`,
      );
    }
    const channel = rawChannel as ChannelKind;

    const maxWaitSec =
      typeof config.maxWaitSec === 'number' && config.maxWaitSec > 0
        ? config.maxWaitSec
        : DEFAULT_MAX_WAIT_SEC;

    const nextNodeIds = (workflow.edges ?? [])
      .filter(e => e.source === node.id)
      .map(e => e.target);
    if (nextNodeIds.length === 0) {
      throw new Error('wait-for-channel-response node has no outgoing edges');
    }

    const executionId = execution._id?.toString();
    if (!executionId) {
      throw new Error('Execution has no _id');
    }

    const outputVar = typeof config.outputVar === 'string' ? config.outputVar : 'channelResponse';
    const expiresAt = Date.now() + maxWaitSec * 1000;

    await persistChannelPendingResume(executionId, {
      kind: 'channel.message.received',
      channel,
      key: contactId,
      nextNodeIds,
      waitNodeId: node.id,
      expiresAt,
      payload: { outputVar },
    });

    throw new ExecutionPausedForEvent(node.id, nextNodeIds, {
      kind: 'channel.message.received',
      key: `${channel}:${contactId}`,
      timeoutMs: maxWaitSec * 1000,
      payload: { outputVar },
    });
  }
}
