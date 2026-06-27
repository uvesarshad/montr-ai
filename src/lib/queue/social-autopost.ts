/**
 * Social RSS→draft autopost cron (audit Epic 4.1).
 *
 * For each enabled RSS source whose cadence has elapsed, fetch the feed, dedupe
 * against the last-seen item, generate a social caption via the AI layer, and
 * create a draft (or a post routed through the approval workflow when the source
 * opts into auto-approve). Human-in-the-loop by default.
 *
 * Modeled exactly on `social-token-refresh.ts`: a self-contained module with its
 * own Queue + Worker + a Redis `SET NX PX` lock so only one worker instance
 * runs the batch per tick.
 */

import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getConnection } from './queue';
import { withRedisLock } from '../workflow/queue/redis-lock';
import { runDueRssSources } from '../social/autopost';

export const SOCIAL_AUTOPOST_QUEUE_NAME = 'social-autopost';
const AUTOPOST_JOB_NAME = 'run-due-rss-sources';
const AUTOPOST_REPEAT_JOB_ID = 'social-autopost-cron';

/** Distributed lock so only one worker instance runs the batch per tick. */
const AUTOPOST_LOCK_KEY = 'social:autopost:lock';
const AUTOPOST_LOCK_TTL_MS = 13 * 60 * 1000; // 13 min — shorter than the 15-min cron.

/** Run the due-source batch under the distributed lock; null if lock held. */
export async function runDueRssSourcesLocked(): Promise<unknown | null> {
    return withRedisLock(AUTOPOST_LOCK_KEY, AUTOPOST_LOCK_TTL_MS, () => runDueRssSources());
}

// ── BullMQ cron registration + consumer ──────────────────────────────────

let cachedAutopostQueue: Queue | null = null;

function getAutopostQueue(): Queue {
    if (!cachedAutopostQueue) {
        cachedAutopostQueue = new Queue(SOCIAL_AUTOPOST_QUEUE_NAME, {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 24 * 3600, count: 100 },
                removeOnFail: { age: 7 * 24 * 3600, count: 200 },
            },
        });
    }
    return cachedAutopostQueue;
}

/** Register the 15-minute autopost cron. Idempotent (fixed repeat jobId). */
export async function scheduleSocialAutopost(): Promise<void> {
    try {
        const queue = getAutopostQueue();
        await queue.add(
            AUTOPOST_JOB_NAME,
            { trigger: 'cron' },
            {
                repeat: { pattern: '*/15 * * * *' }, // Every 15 minutes
                jobId: AUTOPOST_REPEAT_JOB_ID,
            }
        );
        console.log('[social-autopost] Autopost cron registered (every 15 min).');
    } catch (error: unknown) {
        console.warn(
            '[social-autopost] Could not register autopost cron (Redis might be down):',
            error instanceof Error ? error.message : String(error)
        );
    }
}

let cachedAutopostWorker: Worker | null = null;

/** Start the consumer that runs the autopost batch when the cron fires. */
export function createSocialAutopostWorker(): Worker {
    if (cachedAutopostWorker) return cachedAutopostWorker;

    cachedAutopostWorker = new Worker(
        SOCIAL_AUTOPOST_QUEUE_NAME,
        async (_job: Job) => {
            const result = await runDueRssSourcesLocked();
            return result ?? { skipped: 'lock-held' };
        },
        {
            connection: getConnection(),
            concurrency: 1,
        }
    );

    cachedAutopostWorker.on('failed', (job, err) => {
        console.error(`[social-autopost] Autopost job ${job?.id} failed:`, err?.message || err);
    });
    cachedAutopostWorker.on('error', (err) => {
        console.error('[social-autopost] Worker error:', err?.message || err);
    });

    console.log('[social-autopost] Social autopost worker started');

    return cachedAutopostWorker;
}
