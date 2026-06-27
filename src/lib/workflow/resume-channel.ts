/**
 * Resume executions paused on a channel-message event (B3 — generalizes the
 * voice pause-for-event pattern across WhatsApp / email / inbox / telegram).
 *
 * The `wait-for-channel-response` processor parks its execution by:
 *   1. Persisting `execution.context.pendingResume = { kind: 'channel.message.received', key, channel, ... }`
 *      so producers (this module) can find waiting runs by `(channel, key)` match.
 *   2. Throwing `ExecutionPausedForEvent` which the engine catches and marks
 *      the run PAUSED.
 *
 * When an inbound message lands for a contact (WhatsApp webhook, inbox
 * message ingest, email sync), the producer calls
 * `resumePausedExecutionsForChannelMessage` to find every matching paused
 * execution and re-enqueue it via the standard `enqueueExecution` path with
 * `resume: { fromNodeIds, ... }`.
 *
 * Lifts the same primitive voice (V-6.4) uses — both ultimately resolve through
 * the generic `event-resumer.ts` (B2-NEW.4 / FUP-2) when an event arrives.
 */

import mongoose, { Types } from 'mongoose';

import UnifiedWorkflowExecution from '@/lib/db/models/unified-workflow-execution.model';
import { ExecutionStatus } from '@/lib/db/models/unified-workflow.model';
import { enqueueExecution } from '@/lib/workflow/queue/execution-queue';

export type ChannelKind = 'whatsapp' | 'email' | 'inbox' | 'telegram' | 'instagram' | 'facebook' | 'sms';

export interface ChannelPendingResume {
  kind: 'channel.message.received';
  /** Channel that the message arrived on. */
  channel: ChannelKind;
  /** Match key — typically the CRM contactId. */
  key: string;
  /** Outgoing nodes the run should fan out to on resume. */
  nextNodeIds: string[];
  /** Wait node id the run paused at. */
  waitNodeId: string;
  /** Absolute ms when the wait expires. */
  expiresAt?: number;
  /** Free-form spec payload (output variable name, filters, etc). */
  payload?: Record<string, unknown>;
}

export interface ChannelMessagePayload {
  /** Message id from the channel-specific message model. */
  messageId: string;
  /** Text content of the message (snippet, not full body). */
  content?: string;
  /** Direction — always 'inbound' for resume triggers. */
  direction: 'inbound';
  /** Optional channel-specific extras for downstream nodes. */
  extra?: Record<string, unknown>;
}

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

/**
 * Persist a pending-resume spec on the execution doc. Called by the processor
 * just before it throws `ExecutionPausedForEvent`.
 */
export async function persistChannelPendingResume(
  executionId: string,
  spec: ChannelPendingResume,
): Promise<void> {
  await ensureConnection();
  await UnifiedWorkflowExecution.updateOne(
    { _id: new Types.ObjectId(executionId) },
    {
      $set: {
        'context.pendingResume': {
          ...spec,
          pausedAt: new Date(),
        },
      },
    },
  );
}

/**
 * Find every paused execution waiting on a channel message for this contact
 * and channel, and re-enqueue them with the matched message payload bound.
 *
 * Producer call sites:
 *   - WhatsApp webhook (`/api/webhooks/whatsapp`) on inbound text/media
 *   - Inbox message ingest path
 *   - Email-sync inbound handler
 */
export async function resumePausedExecutionsForChannelMessage(args: {
  channel: ChannelKind;
  contactId: string;
  message: ChannelMessagePayload;
}): Promise<{ resumed: number; errors: Array<{ executionId: string; error: string }> }> {
  await ensureConnection();

  const docs = await UnifiedWorkflowExecution.find({
    status: ExecutionStatus.PAUSED,
    'context.pendingResume.kind': 'channel.message.received',
    'context.pendingResume.channel': args.channel,
    'context.pendingResume.key': args.contactId,
  }).lean().exec();

  const result = { resumed: 0, errors: [] as Array<{ executionId: string; error: string }> };

  for (const doc of docs as Array<Record<string, unknown>>) {
    const executionId = String(doc._id);
    try {
      const ctx = (doc.context ?? {}) as Record<string, unknown>;
      const spec = (ctx.pendingResume ?? {}) as ChannelPendingResume & { pausedAt?: Date };
      const nextNodeIds = Array.isArray(spec.nextNodeIds) ? spec.nextNodeIds : [];
      if (nextNodeIds.length === 0) {
        result.errors.push({ executionId, error: 'Resume spec missing nextNodeIds' });
        continue;
      }
      // Skip if the wait already expired — let the timeout-resume path handle it.
      if (spec.expiresAt && spec.expiresAt < Date.now()) continue;

      const outputVar = (spec.payload?.outputVar as string | undefined) ?? 'channelResponse';
      const variables: Record<string, unknown> = {
        ...((doc.variables as Record<string, unknown>) ?? {}),
        [outputVar]: {
          matched: true,
          channel: args.channel,
          contactId: args.contactId,
          ...args.message,
        },
      };

      await UnifiedWorkflowExecution.updateOne(
        { _id: new Types.ObjectId(executionId) },
        {
          $set: { variables },
          $unset: { 'context.pendingResume': '' },
        },
      );

      await enqueueExecution({
        workflowId: String(doc.workflowId),
        userId: String(doc.userId),
        contactId: doc.contactId ? String(doc.contactId) : undefined,
        dealId: doc.dealId ? String(doc.dealId) : undefined,
        campaignId: doc.campaignId ? String(doc.campaignId) : undefined,
        executionId,
        triggerData: (doc.triggerData ?? {}) as Record<string, unknown>,
        source: 'channel-message-resume',
        resume: { fromNodeIds: nextNodeIds, delayNodeId: spec.waitNodeId },
      });
      result.resumed++;
    } catch (err) {
      result.errors.push({
        executionId,
        error: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  return result;
}
