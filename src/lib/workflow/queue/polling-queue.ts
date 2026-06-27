/**
 * BullMQ queue for polling triggers (audit finding H5).
 *
 * Distinct from the execution queue: a poll job does NOT run a workflow. It runs
 * a FETCHER (Gmail / Sheets / RSS), diffs the result against the per-workflow
 * cursor, and enqueues one ordinary execution per NEW item onto the execution
 * queue. Keeping it on its own queue means poll ticks never compete with (or get
 * de-prioritised behind) real executions, and the poll worker concurrency is
 * tuned independently.
 *
 * Polling triggers become BullMQ repeatable jobs (one per workflow) via
 * `polling-scheduler.ts`, mirroring the scheduled-workflow machinery.
 */

import { Queue, ConnectionOptions } from 'bullmq';
import { getRedisConnection } from './connection';

export const POLLING_QUEUE_NAME = 'workflow-polling';

export interface PollingJobPayload {
  /** Workflow whose polling trigger fired this tick. */
  workflowId: string;
  /** Marker so the worker can distinguish poll jobs from anything else. */
  kind: 'poll';
}

let cachedQueue: Queue | null | undefined;

export function getPollingQueue(): Queue | null {
  if (cachedQueue !== undefined) return cachedQueue;
  const connection = getRedisConnection();
  if (!connection) {
    cachedQueue = null;
    return null;
  }
  cachedQueue = new Queue(POLLING_QUEUE_NAME, {
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: {
      // Each tick is independent — a missed tick is fine, don't pile them up.
      removeOnComplete: { age: 24 * 3600, count: 500 },
      removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
      attempts: 1, // the executor handles its own failure backoff via the cursor doc
    },
  });
  return cachedQueue;
}
