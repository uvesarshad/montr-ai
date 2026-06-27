/**
 * Voice campaign queue (Phase 4).
 *
 * BullMQ queue `voice-campaign` that drives durable bulk dialing. Instead of an
 * in-memory `setTimeout(60_000)` loop (the legacy `scheduleBulkDispatch`), each
 * batch is advanced by a self-re-enqueuing `CampaignTickJob`: a tick places one
 * dial-window's worth of calls, then schedules the next tick as a DELAYED job.
 * That makes the dialer survive process churn — a restarted worker's boot
 * sweeper (`resumePendingCampaigns`) re-enqueues ticks for any `running` batch.
 *
 * Mirrors `execution-queue.ts`: a cached, null-safe singleton; the ioredis
 * client is passed as the connection and cast `as unknown as ConnectionOptions`
 * because @types/bullmq lags the runtime union.
 *
 * 🔒 Every job carries `organizationId`; the worker re-reads the batch by id so
 * tenant state stays canonical in Mongo.
 */

import { Queue, QueueEvents, JobsOptions, ConnectionOptions } from 'bullmq';
import { getRedisConnection, isQueueConfigured } from '@/lib/workflow/queue/connection';

export const CAMPAIGN_QUEUE_NAME = 'voice-campaign';

/** Job name for a single dial-window tick. */
export const CAMPAIGN_TICK_JOB = 'tick';

export interface CampaignTickJob {
  batchId: string;
}

let cachedQueue: Queue<CampaignTickJob> | null | undefined;

export function getCampaignQueue(): Queue<CampaignTickJob> | null {
  if (cachedQueue !== undefined) return cachedQueue;
  const connection = getRedisConnection();
  if (!connection) {
    cachedQueue = null;
    return null;
  }
  cachedQueue = new Queue<CampaignTickJob>(CAMPAIGN_QUEUE_NAME, {
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: {
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
      // The orchestrator owns retry/backoff semantics at the call level — keep
      // the tick job a dumb pipe so a transient tick failure doesn't double-dial.
      attempts: 1,
    },
  });
  return cachedQueue;
}

let cachedEvents: QueueEvents | null | undefined;
export function getCampaignQueueEvents(): QueueEvents | null {
  if (cachedEvents !== undefined) return cachedEvents;
  const connection = getRedisConnection();
  if (!connection) {
    cachedEvents = null;
    return null;
  }
  cachedEvents = new QueueEvents(CAMPAIGN_QUEUE_NAME, {
    connection: connection as unknown as ConnectionOptions,
  });
  return cachedEvents;
}

/**
 * Deterministic job id for a batch's tick. Using one id per batch means BullMQ
 * de-dupes overlapping ticks: a boot-sweep re-enqueue can't stack a second tick
 * on top of one that's already delayed/waiting for the same batch.
 */
export function tickJobId(batchId: string, slot: number): string {
  return `campaign-tick:${batchId}:${slot}`;
}

/**
 * Enqueue a tick for a batch. `delayMs` schedules the next dial window (the
 * legacy 60s spacing by default). `slot` increments per window so consecutive
 * ticks get distinct job ids (BullMQ rejects re-adding a completed/active id).
 *
 * Returns false (no-op) when Redis isn't configured — the caller should fall
 * back to the legacy in-process dispatcher in that environment.
 */
export async function enqueueTick(
  job: CampaignTickJob,
  opts?: { delayMs?: number; slot?: number },
): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  const queue = getCampaignQueue();
  if (!queue) return false;

  const jobOpts: JobsOptions = {
    jobId: tickJobId(job.batchId, opts?.slot ?? 0),
  };
  if (opts?.delayMs && opts.delayMs > 0) jobOpts.delay = opts.delayMs;

  await queue.add(CAMPAIGN_TICK_JOB, job, jobOpts);
  return true;
}
