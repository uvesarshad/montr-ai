/**
 * Social scheduled-post recovery + stall sweeper (audit C2 2026-06-06).
 *
 * The publish pipeline relies on BullMQ *delayed* jobs (`schedulePost()` in
 * `queue.ts`) — but delayed jobs live only in Redis. Two failure modes leave
 * posts silently stuck with nothing to recover them:
 *
 *   1. Lost delayed jobs — Redis flush / eviction / restart without AOF wipes
 *      the delayed job; the post stays `scheduled` forever and never publishes.
 *      → Re-enqueue anything overdue via the normal `schedulePost()` path. The
 *        deterministic jobId (`scheduled-post-<id>`) makes this idempotent: if
 *        the original delayed job is still alive BullMQ collapses the
 *        duplicate, and if the post already published the worker's own
 *        status check (`status !== 'scheduled'`) no-ops.
 *
 *   2. Worker crash mid-publish — the post is flipped to `publishing` by
 *      `markAsPublishing` and the process dies before `markAsPublished`.
 *      → Fail-out posts stuck in `publishing` past a stall window so the UI
 *        shows the failure instead of an eternal spinner. We deliberately do
 *        NOT auto-retry these: some platforms may have already received the
 *        post before the crash, and the retry path currently re-publishes
 *        every platform (double-publish risk — see audit §7).
 *
 * Modeled on `src/lib/workflow/queue/execution-sweeper.ts`: a 5-minute BullMQ
 * repeatable cron whose body runs under a Redis `SET NX PX` lock so only one
 * worker instance sweeps per tick.
 */

import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getConnection, schedulePost } from './queue';
import { withRedisLock } from '../workflow/queue/redis-lock';
import { scheduledPostRepository } from '../db/repository/scheduled-post.repository';

export const SOCIAL_SWEEPER_QUEUE_NAME = 'social-post-sweeper';
const SWEEP_JOB_NAME = 'sweep-social-posts';
const SWEEP_REPEAT_JOB_ID = 'social-post-sweeper-cron';

/** Distributed lock so only one worker instance sweeps per tick. */
const SWEEP_LOCK_KEY = 'social:post-sweeper:lock';
const SWEEP_LOCK_TTL_MS = 4 * 60 * 1000; // 4 min — shorter than the 5-min cron.

/**
 * Grace before an overdue `scheduled` post is considered lost. Gives the
 * normal delayed job time to fire on its own (worker pickup latency, clock
 * skew) before the sweeper re-enqueues.
 */
const OVERDUE_GRACE_MS = 2 * 60 * 1000; // 2 min

/**
 * How long a post may sit in `publishing` before we declare the worker dead.
 * A healthy multi-platform publish completes in seconds; 15 minutes covers
 * the slowest media uploads with a wide margin.
 */
const PUBLISHING_STALL_MS = 15 * 60 * 1000;

/** Cap how many docs we touch per sweep so a backlog can't blow up one tick. */
const SWEEP_BATCH_LIMIT = 200;

export interface SocialSweepReport {
    scanned: number;
    requeuedOverdue: number;
    failedStuck: number;
    errors: number;
}

/**
 * Reconcile overdue `scheduled` and stalled `publishing` posts against Mongo
 * (the source of truth). Idempotent and safe to run alongside live workers.
 */
export async function sweepSocialPosts(): Promise<SocialSweepReport> {
    const report: SocialSweepReport = { scanned: 0, requeuedOverdue: 0, failedStuck: 0, errors: 0 };
    const now = Date.now();

    // ── 1. Overdue `scheduled` posts (lost delayed jobs) ──────────────────
    try {
        const due = await scheduledPostRepository.findDueForPublishing(SWEEP_BATCH_LIMIT);
        for (const post of due) {
            // Only act past the grace window — fresh due posts are normally
            // picked up by their own delayed job within seconds.
            if (now - new Date(post.scheduledFor).getTime() < OVERDUE_GRACE_MS) continue;
            report.scanned++;
            try {
                const job = await schedulePost(String(post._id), post.scheduledFor);
                if (job) report.requeuedOverdue++;
            } catch (err) {
                report.errors++;
                console.error(
                    `[social-sweeper] Failed to re-enqueue overdue post ${post._id}:`,
                    err instanceof Error ? err.message : err
                );
            }
        }
    } catch (err) {
        report.errors++;
        console.error('[social-sweeper] Overdue-post scan failed:', err instanceof Error ? err.message : err);
    }

    // ── 2. Posts stuck in `publishing` (worker died mid-publish) ──────────
    try {
        const stallCutoff = new Date(now - PUBLISHING_STALL_MS);
        const stuck = await scheduledPostRepository.findStuckPublishing(stallCutoff, SWEEP_BATCH_LIMIT);
        for (const post of stuck) {
            report.scanned++;
            try {
                const claimed = await scheduledPostRepository.failOutStuckPublishing(
                    String(post._id),
                    stallCutoff,
                    'worker_crashed_mid_publish'
                );
                if (claimed) report.failedStuck++;
            } catch (err) {
                report.errors++;
                console.error(
                    `[social-sweeper] Failed to fail-out stuck post ${post._id}:`,
                    err instanceof Error ? err.message : err
                );
            }
        }
    } catch (err) {
        report.errors++;
        console.error('[social-sweeper] Stuck-publishing scan failed:', err instanceof Error ? err.message : err);
    }

    if (report.requeuedOverdue > 0 || report.failedStuck > 0 || report.errors > 0) {
        console.log(
            `[social-sweeper] Sweep complete — scanned=${report.scanned} requeuedOverdue=${report.requeuedOverdue} failedStuck=${report.failedStuck} errors=${report.errors}`
        );
    }
    return report;
}

/**
 * Run the sweep under the distributed lock. Returns null if another worker
 * instance holds the lock this tick.
 */
export async function sweepSocialPostsLocked(): Promise<SocialSweepReport | null> {
    return withRedisLock(SWEEP_LOCK_KEY, SWEEP_LOCK_TTL_MS, sweepSocialPosts);
}

// ── BullMQ cron registration + consumer ──────────────────────────────────

let cachedSweeperQueue: Queue | null = null;

function getSweeperQueue(): Queue {
    if (!cachedSweeperQueue) {
        cachedSweeperQueue = new Queue(SOCIAL_SWEEPER_QUEUE_NAME, {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 24 * 3600, count: 100 },
                removeOnFail: { age: 7 * 24 * 3600, count: 200 },
            },
        });
    }
    return cachedSweeperQueue;
}

/**
 * Register the 5-minute sweeper cron. Idempotent (fixed repeat jobId).
 */
export async function scheduleSocialPostSweeper(): Promise<void> {
    try {
        const queue = getSweeperQueue();
        await queue.add(
            SWEEP_JOB_NAME,
            { trigger: 'cron' },
            {
                repeat: { pattern: '*/5 * * * *' }, // Every 5 minutes
                jobId: SWEEP_REPEAT_JOB_ID,
            }
        );
        console.log('[social-sweeper] Sweeper cron registered (every 5 min).');
    } catch (error: unknown) {
        console.warn(
            '[social-sweeper] Could not register sweeper cron (Redis might be down):',
            error instanceof Error ? error.message : String(error)
        );
    }
}

let cachedSweeperWorker: Worker | null = null;

/** Start the consumer that runs the sweep when the cron fires. */
export function createSocialPostSweeperWorker(): Worker {
    if (cachedSweeperWorker) return cachedSweeperWorker;

    cachedSweeperWorker = new Worker(
        SOCIAL_SWEEPER_QUEUE_NAME,
        async (_job: Job) => {
            const result = await sweepSocialPostsLocked();
            return result ?? { skipped: 'lock-held' };
        },
        {
            connection: getConnection(),
            concurrency: 1,
        }
    );

    cachedSweeperWorker.on('failed', (job, err) => {
        console.error(`[social-sweeper] Sweep job ${job?.id} failed:`, err?.message || err);
    });
    cachedSweeperWorker.on('error', (err) => {
        console.error('[social-sweeper] Worker error:', err?.message || err);
    });

    console.log('[social-sweeper] Social post sweeper worker started');

    return cachedSweeperWorker;
}
