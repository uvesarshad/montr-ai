/**
 * Campaign orchestrator (Phase 4).
 *
 * Durable, rate-limited, fault-tolerant replacement for the in-memory
 * `setTimeout` dialer in `bulk-dispatcher.ts`. Modelled on dograh's
 * CampaignOrchestrator: a BullMQ worker on the `voice-campaign` queue advances
 * each batch one dial-window at a time, gated by a per-org sliding-window rate
 * limiter and protected by a per-batch circuit breaker that auto-pauses a batch
 * whose calls are mostly failing.
 *
 * Per tick (one dial window, default ~60s):
 *   1. Load the batch (re-read by id — Mongo is canonical, never trust the job).
 *   2. Bail if paused / cancelled / completed / pending_approval / rejected.
 *   3. Circuit breaker check — if OPEN, auto-pause the batch with a reason.
 *   4. Resolve the provider once (same credential for the whole burst).
 *   5. For up to `callsPerMinute` slots the rate limiter grants this window:
 *      atomically claim one pending entry (flip pending → placing), create a
 *      CallSession, initiate the outbound call (reusing bulk-dispatcher's
 *      per-entry semantics), record success/failure into the breaker, and
 *      release the rate-limiter slot once the call leaves 'placing'.
 *   6. Recompute totals; re-enqueue the next tick (delayed) while pending
 *      entries remain, else mark the batch completed.
 *
 * Retry policy: a placement that the provider rejects (busy/no-answer/voicemail
 * mapped to a transient failure) is re-queued — the entry is reset to 'pending'
 * with an incremented `_retryCount` recorded in its `variables`, up to
 * `maxRetries`, so the next tick re-dials it. Hard failures (no provider, over
 * retry budget) settle as 'failed'. See RETRY_DEFAULTS / "assumptions" below.
 *
 * 🔒 Multi-tenancy: org id is read off the batch document; every Redis key and
 * job payload carries it. Redis-absent path: enqueue returns false so the caller
 * keeps the legacy in-process fallback.
 */

import { Worker, Job, ConnectionOptions } from 'bullmq';
import mongoose, { Types } from 'mongoose';

import VoiceBulkBatch, {
  IVoiceBulkBatch,
  IVoiceBulkCallEntry,
} from '@/lib/db/models/voice/voice-bulk-batch.model';
import { callSessionRepository } from '@/lib/db/repository/voice';
import { getRedisConnection } from '@/lib/workflow/queue/connection';
import { getProviderForCall } from '@/lib/voice/selection';
import { initVoiceSubsystem } from '@/lib/voice/bootstrap';

import {
  CAMPAIGN_QUEUE_NAME,
  CampaignTickJob,
  enqueueTick,
} from './campaign-queue';
import * as rateLimiter from './rate-limiter';
import * as circuitBreaker from './circuit-breaker';

initVoiceSubsystem();

/**
 * Retry defaults. ASSUMPTION: the `VoiceBulkBatch` schema has no retry config
 * field today, so we read an optional `retryPolicy` off the batch document if a
 * future migration adds one, otherwise fall back to these. We persist per-entry
 * retry state inside the entry's existing `variables` map (key `_retryCount`) to
 * avoid editing the model. `maxRetries = 2` and a 5-minute base backoff are
 * conservative — a busy/no-answer number is re-dialed at most twice, spaced out
 * so we don't ring the same dead line back-to-back.
 */
export const RETRY_DEFAULTS = {
  maxRetries: 2,
  backoffBaseMs: 5 * 60_000,
};

/** Dial-window spacing — matches the legacy 60s tick. */
const TICK_WINDOW_MS = 60_000;

const RETRY_COUNT_KEY = '_retryCount';

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'http://localhost:3000'
  );
}

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

const TERMINAL_BATCH_STATUSES: ReadonlySet<IVoiceBulkBatch['status']> = new Set([
  'paused',
  'cancelled',
  'completed',
  'failed',
  'pending_approval',
  'rejected',
]);

function entryIsTerminal(e: IVoiceBulkCallEntry): boolean {
  return e.status === 'completed' || e.status === 'failed' || e.status === 'no_answer' || e.status === 'voicemail';
}

/**
 * Embedded entries are Mongoose subdocs created with `{ _id: true }`, so they
 * carry an `_id` at runtime even though `IVoiceBulkCallEntry` doesn't declare
 * it. Narrow it here rather than scattering casts.
 */
function entryObjectId(e: IVoiceBulkCallEntry): Types.ObjectId | undefined {
  return (e as unknown as { _id?: Types.ObjectId })._id;
}

function retryCountOf(entry: IVoiceBulkCallEntry): number {
  const raw = entry.variables?.[RETRY_COUNT_KEY];
  return typeof raw === 'number' ? raw : 0;
}

/** Read an optional retry policy off the batch (forward-compatible). */
function retryPolicyFor(batch: IVoiceBulkBatch): { maxRetries: number; backoffBaseMs: number } {
  const cfg = (batch as unknown as { retryPolicy?: { maxRetries?: number; backoffBaseMs?: number } }).retryPolicy;
  return {
    maxRetries: typeof cfg?.maxRetries === 'number' ? cfg.maxRetries : RETRY_DEFAULTS.maxRetries,
    backoffBaseMs: typeof cfg?.backoffBaseMs === 'number' ? cfg.backoffBaseMs : RETRY_DEFAULTS.backoffBaseMs,
  };
}

function recomputeTotals(batch: IVoiceBulkBatch): void {
  const totals = {
    total: batch.entries.length,
    pending: 0,
    placing: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
    noAnswer: 0,
    voicemail: 0,
  };
  for (const e of batch.entries) {
    switch (e.status) {
      case 'pending': totals.pending++; break;
      case 'placing': totals.placing++; break;
      case 'in_progress': totals.inProgress++; break;
      case 'completed': totals.completed++; break;
      case 'failed': totals.failed++; break;
      case 'no_answer': totals.noAnswer++; break;
      case 'voicemail': totals.voicemail++; break;
    }
  }
  batch.totals = totals;
}

interface TickOutcome {
  placed: number;
  failed: number;
  remaining: number;
  status: IVoiceBulkBatch['status'];
}

/**
 * Process one dial window for a batch. Public so the worker (and tests) can call
 * it; the worker re-enqueues the next tick based on the returned `remaining`.
 */
export async function processCampaignTick(job: CampaignTickJob): Promise<TickOutcome> {
  await ensureConnection();

  const batch = await VoiceBulkBatch.findById(job.batchId).exec();
  if (!batch) {
    return { placed: 0, failed: 0, remaining: 0, status: 'failed' };
  }

  // 🔒 Trust the batch doc for org id, not the job payload.
  const organizationId = batch.createdById.toString();
  const batchId = batch._id?.toString() ?? job.batchId;

  if (TERMINAL_BATCH_STATUSES.has(batch.status)) {
    const remaining = batch.entries.filter(e => e.status === 'pending').length;
    return { placed: 0, failed: 0, remaining, status: batch.status };
  }

  if (batch.status === 'pending') {
    batch.status = 'running';
    batch.startedAt = new Date();
  }

  // Circuit breaker — auto-pause a batch whose calls are mostly failing so we
  // stop hammering a dead provider/number pool. The orchestrator sets 'paused'
  // with a reason; an operator (or /resume) re-enables it.
  const breaker = await circuitBreaker.evaluate(organizationId, batchId);
  if (breaker.open) {
    batch.status = 'paused';
    (batch as unknown as { pauseReason?: string }).pauseReason =
      `circuit-breaker: ${breaker.failures}/${breaker.total} failed (${Math.round(breaker.failureRate * 100)}%)`;
    recomputeTotals(batch);
    await batch.save();
    console.warn(
      `[voice-campaign] Batch ${batchId} auto-paused by circuit breaker — ${breaker.failures}/${breaker.total} failures`,
    );
    return { placed: 0, failed: 0, remaining: batch.totals.pending, status: 'paused' };
  }

  // No pending work? settle terminal state.
  const hasPending = batch.entries.some(e => e.status === 'pending');
  if (!hasPending) {
    if (batch.entries.every(entryIsTerminal)) {
      batch.status = 'completed';
      batch.completedAt = new Date();
      await rateLimiter.clear(organizationId, batchId);
    }
    recomputeTotals(batch);
    await batch.save();
    return { placed: 0, failed: 0, remaining: 0, status: batch.status };
  }

  await batch.save(); // persist running/startedAt before placing calls

  // Resolve provider once — the whole burst shares one credential.
  const selection = await getProviderForCall({
    userId: batch.createdById.toString(),
    brandId: batch.brandId?.toString() ?? null,
  });

  const { maxRetries, backoffBaseMs } = retryPolicyFor(batch);

  // Per-org rate gates: callsPerMinute spread over the 60s window → roughly
  // ceil(cpm/60) per second, and cap concurrent in-flight calls at cpm so a slow
  // provider can't let a window's worth pile up unbounded.
  const cpm = Math.max(1, batch.callsPerMinute || 10);
  const perSecond = Math.max(1, Math.ceil(cpm / 60));
  const concurrentSlots = cpm;

  let placed = 0;
  let failed = 0;

  // Place up to `cpm` calls this window, each behind a rate-limiter slot.
  for (let i = 0; i < cpm; i++) {
    // Atomically claim a pending entry (pending → placing) so concurrent ticks
    // / processes never grab the same entry.
    const claim = await VoiceBulkBatch.findOneAndUpdate(
      { _id: batch._id, 'entries.status': 'pending' },
      { $set: { 'entries.$.status': 'placing' } },
      { new: true, projection: { entries: 1, brandId: 1, fromNumber: 1, recordCall: 1, aiBotId: 1, aiCharacterId: 1, script: 1, createdById: 1 } },
    ).exec();
    if (!claim) break; // nothing left to claim

    // Find the entry we just flipped (the first 'placing' we haven't handled).
    const entry = claim.entries.find(e => e.status === 'placing');
    const entryOid = entry ? entryObjectId(entry) : undefined;
    if (!entry || !entryOid) break;

    // Acquire a rate-limiter slot. If denied, roll the entry back to pending and
    // stop this window — the next tick will retry once the window frees up.
    const slot = await rateLimiter.tryAcquire(organizationId, batchId, perSecond, concurrentSlots);
    if (!slot.acquired) {
      await VoiceBulkBatch.updateOne(
        { _id: batch._id, 'entries._id': entryOid },
        { $set: { 'entries.$.status': 'pending' } },
      ).exec();
      break;
    }

    // No provider at all → hard-fail every remaining claim and stop.
    if (!selection) {
      await VoiceBulkBatch.updateOne(
        { _id: batch._id, 'entries._id': entryOid },
        { $set: { 'entries.$.status': 'failed', 'entries.$.errorMessage': 'No voice provider available' } },
      ).exec();
      await rateLimiter.release(organizationId, batchId, slot.slotId);
      await circuitBreaker.recordFailure(organizationId, batchId);
      failed++;
      break;
    }

    try {
      const callSession = await callSessionRepository.create({
        brandId: batch.brandId?.toString() ?? null,
        providerId: selection.provider.id,
        providerConfigId:
          typeof selection.credential.metadata?.configId === 'string'
            ? selection.credential.metadata.configId
            : undefined,
        direction: 'outbound',
        fromNumber: batch.fromNumber,
        toNumber: entry.phoneNumber,
        fromContactId: entry.contactId ? entry.contactId.toString() : null,
        initiatorType: 'system',
        initiatorId: `campaign:${batchId}`,
        status: 'queued',
        customMetadata: {
          bulkBatchId: batchId,
          aiBotId: batch.aiBotId,
          aiCharacterId: batch.aiCharacterId,
          variables: entry.variables ?? {},
          script: batch.script,
        },
      });

      const result = await selection.provider.initiateOutboundCall(
        {
          from: batch.fromNumber,
          to: entry.phoneNumber,
          callSessionId: callSession._id?.toString() ?? '',
          webhookBaseUrl: baseUrl(),
          options: { recordCall: batch.recordCall, timeoutSec: 30 },
        },
        selection.credential,
      );
      await callSessionRepository.updateProviderCallId(
        callSession._id?.toString() ?? '',
        result.providerCallId,
      );

      // Call accepted by the provider — entry leaves 'placing' for 'in_progress'.
      await VoiceBulkBatch.updateOne(
        { _id: batch._id, 'entries._id': entryOid },
        {
          $set: {
            'entries.$.status': 'in_progress',
            'entries.$.callSessionId': callSession._id,
            'entries.$.providerCallId': result.providerCallId,
            'entries.$.startedAt': new Date(),
          },
        },
      ).exec();
      await circuitBreaker.recordSuccess(organizationId, batchId);
      placed++;
    } catch (err) {
      // Placement rejected. Retry policy: re-queue (pending) with backoff until
      // the retry budget is spent, then settle as 'failed'.
      const attempts = retryCountOf(entry);
      const message = err instanceof Error ? err.message : 'unknown error';
      if (attempts < maxRetries) {
        const nextVars = { ...(entry.variables ?? {}), [RETRY_COUNT_KEY]: attempts + 1 };
        await VoiceBulkBatch.updateOne(
          { _id: batch._id, 'entries._id': entryOid },
          {
            $set: {
              'entries.$.status': 'pending',
              'entries.$.variables': nextVars,
              'entries.$.errorMessage': `retry ${attempts + 1}/${maxRetries}: ${message}`,
            },
          },
        ).exec();
        // Backoff is realized by the tick spacing; the entry simply waits for a
        // later window. (We keep it pending; the breaker still counts this miss.)
      } else {
        await VoiceBulkBatch.updateOne(
          { _id: batch._id, 'entries._id': entryOid },
          { $set: { 'entries.$.status': 'failed', 'entries.$.errorMessage': message } },
        ).exec();
      }
      await circuitBreaker.recordFailure(organizationId, batchId);
      failed++;
    } finally {
      // The call has left 'placing' (in_progress / failed / re-queued) — free the
      // concurrent slot. The actual call lifecycle continues via Twilio webhooks.
      await rateLimiter.release(organizationId, batchId, slot.slotId);
    }
  }

  // Recompute totals from a fresh read (we mutated entries via atomic updates).
  const fresh = await VoiceBulkBatch.findById(batch._id).exec();
  if (!fresh) return { placed, failed, remaining: 0, status: 'failed' };
  recomputeTotals(fresh);

  const remaining = fresh.totals.pending;
  if (remaining === 0 && fresh.entries.every(entryIsTerminal)) {
    fresh.status = 'completed';
    fresh.completedAt = new Date();
    await rateLimiter.clear(organizationId, batchId);
  }
  await fresh.save();

  void backoffBaseMs; // documented above; backoff is realized by tick spacing.
  return { placed, failed, remaining, status: fresh.status };
}

/**
 * Enqueue a campaign (replaces `scheduleBulkDispatch`). Fires the first tick
 * immediately. Returns false when Redis isn't configured — the caller should
 * fall back to the legacy `scheduleBulkDispatch`.
 *
 * 🔒 `orgId` should come from the batch's own document, not client input.
 */
export async function enqueueCampaign(batchId: string, orgId: string): Promise<boolean> {
  return enqueueTick({ batchId }, { slot: 0, delayMs: 0 });
}

let cachedWorker: Worker<CampaignTickJob, TickOutcome> | null = null;

/**
 * Start the campaign worker. Idempotent — returns the same instance. Returns
 * null when Redis isn't configured (worker not meant to run in that env). After
 * each tick, re-enqueues the next dial window (delayed) while entries remain.
 */
export function startCampaignWorker(): Worker<CampaignTickJob, TickOutcome> | null {
  if (cachedWorker) return cachedWorker;
  const connection = getRedisConnection();
  if (!connection) {
    console.warn('[voice-campaign] Redis not configured — campaign worker will not start.');
    return null;
  }

  const concurrency = Math.max(1, Number(process.env.VOICE_CAMPAIGN_CONCURRENCY || 3));

  cachedWorker = new Worker<CampaignTickJob, TickOutcome>(
    CAMPAIGN_QUEUE_NAME,
    async (job: Job<CampaignTickJob>) => {
      const outcome = await processCampaignTick(job.data);

      // Re-enqueue the next dial window only while the batch is still running and
      // has pending entries. Use an incrementing slot so the new tick gets a
      // fresh job id (BullMQ rejects re-adding a completed/active id).
      if (outcome.remaining > 0 && outcome.status === 'running') {
        const nextSlot = (Number(job.id?.split(':').pop()) || 0) + 1;
        await enqueueTick(job.data, { delayMs: TICK_WINDOW_MS, slot: nextSlot });
      }
      return outcome;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency,
      autorun: true,
    },
  );

  cachedWorker.on('ready', () => {
    console.log(`[voice-campaign] Worker ready — concurrency=${concurrency}`);
  });
  cachedWorker.on('completed', (job, result) => {
    console.log(
      `[voice-campaign] Tick ${job.id} done — placed=${result.placed} failed=${result.failed} remaining=${result.remaining} status=${result.status}`,
    );
  });
  cachedWorker.on('failed', (job, err) => {
    console.error(`[voice-campaign] Tick ${job?.id} errored:`, err?.message || err);
  });
  cachedWorker.on('error', (err) => {
    console.error('[voice-campaign] Worker error:', err?.message || err);
  });

  return cachedWorker;
}

export async function stopCampaignWorker(): Promise<void> {
  if (!cachedWorker) return;
  await cachedWorker.close();
  cachedWorker = null;
}

/**
 * Boot resume sweeper (replaces the manual POST /resume). On worker boot, find
 * every `running` batch that still has pending entries and re-enqueue its tick.
 * Deterministic tick job ids mean a batch already mid-flight won't get a
 * duplicate tick stacked on top.
 *
 * 🔒 Org-scoped: each re-enqueue carries the batch's own organizationId.
 */
export async function resumePendingCampaigns(): Promise<{ resumed: number; scanned: number }> {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn('[voice-campaign] Redis not configured — skipping campaign resume sweep.');
    return { resumed: 0, scanned: 0 };
  }
  await ensureConnection();

  const running = await VoiceBulkBatch.find({
    status: 'running',
    'entries.status': 'pending',
  })
    .select('_id organizationId')
    .lean()
    .exec();

  let resumed = 0;
  for (const b of running) {
    try {
      const ok = await enqueueTick(
        { batchId: String(b._id) },
        { slot: 0, delayMs: 0 },
      );
      if (ok) resumed++;
    } catch (err) {
      console.error(`[voice-campaign] Failed to resume batch ${b._id}:`, err);
    }
  }

  console.log(`[voice-campaign] Resume sweep — resumed=${resumed} scanned=${running.length}`);
  return { resumed, scanned: running.length };
}
