/**
 * BullMQ worker for the workflow-polling queue (audit finding H5).
 *
 * Each job is one poll tick for one workflow. It does NOT run a workflow — it
 * delegates to the poll executor, which runs the fetcher, diffs against the
 * cursor, and enqueues executions for new items. Per-tick errors are absorbed by
 * the executor (cursor-based backoff), so we never throw back into BullMQ.
 */

import { Worker, Job, ConnectionOptions } from 'bullmq';
import { getRedisConnection } from './connection';
import { POLLING_QUEUE_NAME, type PollingJobPayload } from './polling-queue';

async function processPollJob(job: Job<PollingJobPayload>): Promise<{ status: string }> {
  const { workflowId } = job.data;
  try {
    const { runPollTick } = await import('../triggers/polling');
    const result = await runPollTick(workflowId);
    return { status: result.status };
  } catch (err: unknown) {
    // Defensive: the executor already handles fetcher failures, but never let a
    // poll job crash the worker.
    console.error(`[polling-worker] Poll job ${job.id} (workflow=${workflowId}) errored:`, err instanceof Error ? err.message : err);
    return { status: 'failed' };
  }
}

let cachedWorker: Worker<PollingJobPayload> | null = null;

export function startPollingWorker(): Worker<PollingJobPayload> | null {
  if (cachedWorker) return cachedWorker;
  const connection = getRedisConnection();
  if (!connection) {
    console.warn('[polling-worker] Redis not configured — poll worker will not start.');
    return null;
  }

  // Poll ticks are I/O-bound (HTTP to Gmail/Sheets/RSS). A modest concurrency is
  // plenty; the heavy work (running workflows) happens on the execution queue.
  const concurrency = Math.max(1, Number(process.env.WORKFLOW_POLL_CONCURRENCY || 3));

  cachedWorker = new Worker<PollingJobPayload>(POLLING_QUEUE_NAME, processPollJob, {
    connection: connection as unknown as ConnectionOptions,
    concurrency,
    autorun: true,
  });

  cachedWorker.on('ready', () => {
    console.log(`[polling-worker] Ready — concurrency=${concurrency}`);
  });
  cachedWorker.on('failed', (job, err) => {
    console.error(`[polling-worker] Job ${job?.id} errored:`, err?.message || err);
  });
  cachedWorker.on('error', (err) => {
    console.error('[polling-worker] Worker error:', err?.message || err);
  });

  return cachedWorker;
}

export async function stopPollingWorker(): Promise<void> {
  if (!cachedWorker) return;
  await cachedWorker.close();
  cachedWorker = null;
}
