/**
 * Polling-trigger executor (audit finding H5).
 *
 * Invoked by the polling worker once per tick per workflow. Flow:
 *   1. Load workflow (must be active + a polling trigger).
 *   2. Resolve the fetcher for trigger.config.pollSource.
 *   3. Decrypt the workflow credential vault (org-owned), org-scoped.
 *   4. Run the fetcher with the stored cursor → { newItems, nextCursor }.
 *   5. SAVE THE CURSOR FIRST (at-most-once preferred over duplicate sends).
 *   6. For each new item (cap 25/tick), enqueue ONE execution for THIS workflow,
 *      with idempotencyKey derived from the item id.
 *   7. Log a one-line summary.
 *
 * Failure handling: a fetcher error keeps the cursor untouched, bumps
 * consecutiveFailures, and skips ticks exponentially (2^n). After 5 consecutive
 * failures the owner is notified once; after 20 the workflow's poll scheduler is
 * unregistered (stop hammering a broken source). A success resets the counter.
 */

import { Types } from 'mongoose';
import { UnifiedWorkflow } from '../../../db/models/unified-workflow.model';
import { PollCursor } from '../../../db/models/poll-cursor.model';
import { decryptCredential } from '../../credential-encryption';
import { enqueueExecution, QueueDepthExceededError, ExecutionQuotaExceededError, QuotaCheckUnavailableError } from '../../queue/execution-queue';
import { unregisterPollingWorkflow } from '../../queue/polling-scheduler';
import type { PollFetcher } from './types';
import { gmailNewEmailFetcher } from './gmail-new-email';
import { sheetsNewRowFetcher } from './sheets-new-row';
import { rssNewItemFetcher } from './rss-new-item';

/** Max executions a single tick may dispatch — overflow is noted and left for next tick. */
const MAX_ITEMS_PER_TICK = 25;
/** Notify the owner after this many consecutive failures (once). */
const NOTIFY_AFTER_FAILURES = 5;
/** Stop polling (unregister) after this many consecutive failures. */
const DISABLE_AFTER_FAILURES = 20;

const FETCHERS: Record<string, PollFetcher> = {
  [gmailNewEmailFetcher.source]: gmailNewEmailFetcher,
  [sheetsNewRowFetcher.source]: sheetsNewRowFetcher,
  [rssNewItemFetcher.source]: rssNewItemFetcher,
};

export interface PollTickResult {
  status: 'ok' | 'skipped' | 'failed' | 'disabled';
  dispatched?: number;
  overflow?: number;
  reason?: string;
}

/**
 * Decrypt the workflow's credential vault into a { name → value } map, mirroring
 * the engine's getDecryptedCredentials (scope = the owner user id).
 */
function decryptVault(
  credentials: Array<Record<string, unknown>>,
  scopeUserId: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const cred of credentials || []) {
    try {
      if (!cred.salt) continue;
      const decrypted = decryptCredential(
        {
          name: String(cred.name),
          type: String(cred.type),
          encryptedValue: String(cred.encryptedValue),
          iv: String(cred.iv),
          authTag: String(cred.authTag),
          salt: String(cred.salt),
          metadata: cred.metadata as Record<string, unknown> | undefined,
        },
        scopeUserId
      );
      out[String(cred.name)] = decrypted.value;
    } catch (err) {
      console.error(`[polling] Failed to decrypt credential ${cred.name}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

export async function runPollTick(workflowId: string): Promise<PollTickResult> {
  const workflow = await UnifiedWorkflow.findById(workflowId);
  if (!workflow) {
    // Workflow gone — tear down the orphaned schedule.
    await unregisterPollingWorkflow(workflowId).catch(() => { /* best-effort */ });
    return { status: 'skipped', reason: 'workflow_not_found' };
  }
  if (workflow.status !== 'active' || workflow.trigger?.type !== 'polling') {
    await unregisterPollingWorkflow(workflowId).catch(() => { /* best-effort */ });
    return { status: 'skipped', reason: 'not_active_polling' };
  }

  const config = (workflow.trigger?.config ?? {}) as Record<string, unknown>;
  const source = String(config.pollSource || '');
  const fetcher = FETCHERS[source];
  if (!fetcher) {
    return { status: 'skipped', reason: `unknown_poll_source:${source}` };
  }
  const userId = workflow.createdById.toString();

  // Load (or lazily create) the cursor doc.
  let cursorDoc = await PollCursor.findOne({ workflowId: workflow._id });
  if (!cursorDoc) {
    cursorDoc = new PollCursor({
      workflowId: workflow._id,
      pollSource: source,
      cursor: undefined,
      consecutiveFailures: 0,
      skipsRemaining: 0,
      ownerNotified: false,
    });
  }

  // Exponential skip backoff: after a failure we set skipsRemaining = 2^(n-1) and
  // decrement it each tick instead of doing wall-clock math — simple and robust
  // across interval edits.
  if ((cursorDoc.skipsRemaining || 0) > 0) {
    const remaining = cursorDoc.skipsRemaining;
    cursorDoc.skipsRemaining = remaining - 1;
    await cursorDoc.save().catch(() => { /* best-effort */ });
    return { status: 'skipped', reason: `backoff:${remaining}` };
  }

  const credentials = decryptVault(
    (workflow.credentials as unknown as Array<Record<string, unknown>>) || [],
    userId
  );

  let result;
  try {
    result = await fetcher.fetch({
      config,
      cursor: cursorDoc.cursor,
      userId,
      credentials,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    cursorDoc.consecutiveFailures = (cursorDoc.consecutiveFailures || 0) + 1;
    cursorDoc.lastError = msg;
    cursorDoc.lastPolledAt = new Date();
    // Schedule exponential skips (cap the exponent so we don't overflow).
    const exp = Math.min(cursorDoc.consecutiveFailures, 6);
    cursorDoc.skipsRemaining = Math.pow(2, exp - 1);

    if (cursorDoc.consecutiveFailures >= NOTIFY_AFTER_FAILURES && !cursorDoc.ownerNotified) {
      cursorDoc.ownerNotified = true;
      void notifyPollFailure(userId, String(workflow.name), source, msg).catch(() => { /* best-effort */ });
    }

    let status: PollTickResult['status'] = 'failed';
    if (cursorDoc.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
      await unregisterPollingWorkflow(workflowId).catch(() => { /* best-effort */ });
      status = 'disabled';
    }
    await cursorDoc.save().catch(() => { /* best-effort */ });
    console.error(`[polling] ${source} fetch failed for workflow ${workflowId} (failures=${cursorDoc.consecutiveFailures}): ${msg}`);
    return { status, reason: msg };
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────────
  // Cap dispatch; note overflow so a backlog drains across ticks rather than
  // firing hundreds of executions at once.
  const all = result.newItems || [];
  const toDispatch = all.slice(0, MAX_ITEMS_PER_TICK);
  const overflow = all.length - toDispatch.length;

  // SAVE THE CURSOR FIRST — at-most-once delivery. If we crash after this, the
  // un-dispatched items are simply not retried (preferred over duplicate sends).
  // When there's overflow, advance the cursor only past what we actually dispatch
  // so the remainder is picked up next tick.
  cursorDoc.cursor = overflow > 0 ? cursorDoc.cursor : result.nextCursor;
  cursorDoc.pollSource = source;
  cursorDoc.consecutiveFailures = 0;
  cursorDoc.lastError = null;
  cursorDoc.ownerNotified = false;
  cursorDoc.lastPolledAt = new Date();
  cursorDoc.lastSuccessAt = new Date();
  cursorDoc.skipsRemaining = 0;
  await cursorDoc.save();

  let dispatched = 0;
  for (const item of toDispatch) {
    const triggerData = {
      eventType: 'polling',
      pollSource: source,
      item,
    };
    try {
      await enqueueExecution({
        workflowId,
        userId,
        triggerData,
        source: `poll-${source}`,
        idempotencyKey: `${workflowId}:poll:${item.id}`,
      });
      dispatched++;
    } catch (err: unknown) {
      if (
        err instanceof QueueDepthExceededError ||
        err instanceof ExecutionQuotaExceededError ||
        err instanceof QuotaCheckUnavailableError
      ) {
        console.warn(`[polling] Skipping item for workflow ${workflowId} — ${err.message}`);
        continue;
      }
      console.error(`[polling] Failed to enqueue item ${item.id} for workflow ${workflowId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Stamp the trigger time for the cooldown guard (best-effort).
  UnifiedWorkflow.updateOne({ _id: workflow._id }, { $set: { lastTriggeredAt: new Date() } })
    .exec()
    .catch(() => { /* best-effort */ });

  console.log(
    `[polling] ${source} workflow ${workflowId} — new=${all.length} dispatched=${dispatched} overflow=${overflow > 0 ? overflow : 0}`
  );
  return { status: 'ok', dispatched, overflow: overflow > 0 ? overflow : 0 };
}

async function notifyPollFailure(
  userId: string,
  workflowName: string,
  source: string,
  error: string
): Promise<void> {
  const { notifyUser } = await import('@/lib/notifications/notification-service');
  await notifyUser(userId, {
    type: 'workflow.poll_failing',
    title: 'A polling automation is failing',
    body: `"${workflowName}" (${source}) has failed to poll repeatedly. Last error: ${error.slice(0, 200)}. Check the connected account or feed URL.`,
    actionLabel: 'Open automations',
    actionUrl: '/automations',
    dedupeKey: `wf:poll-fail:${userId}:${source}:${new Types.ObjectId().toHexString().slice(0, 6)}`,
  });
}
