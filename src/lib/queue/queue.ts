import { Queue, Job, ConnectionOptions } from 'bullmq';

// Redis connection configuration
const getRedisConnectionOptions = (): ConnectionOptions => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // Parse the Redis URL
    const url = new URL(redisUrl);

    return {
        host: url.hostname || 'localhost',
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: null,
    };
};

let socialPostsQueue: Queue | null = null;
let analyticsQueue: Queue | null = null;
let agentTasksQueue: Queue | null = null;
let agentMissionRunnerQueue: Queue | null = null;
let marketingPlanReviewQueue: Queue | null = null;
let notificationDigestQueue: Queue | null = null;
let integrationTokenRefreshQueue: Queue | null = null;
let sourceMetricsQueue: Queue | null = null;
let notionDocSyncQueue: Queue | null = null;
let crmTrashPurgeQueue: Queue | null = null;
let connectionOptions: ConnectionOptions | null = null;

/**
 * Get or create the Redis connection options
 */
export const getConnection = (): ConnectionOptions => {
    if (!connectionOptions) {
        connectionOptions = getRedisConnectionOptions();
    }
    return connectionOptions;
};

/**
 * Get or create the social posts queue
 */
export const getSocialPostsQueue = (): Queue => {
    if (!socialPostsQueue) {
        socialPostsQueue = new Queue('social-posts', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                removeOnComplete: {
                    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
                    count: 1000,
                },
                removeOnFail: {
                    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
                },
            },
        });
    }
    return socialPostsQueue;
};

/**
 * Get or create the analytics sync queue
 */
export const getAnalyticsQueue = (): Queue => {
    if (!analyticsQueue) {
        analyticsQueue = new Queue('social-analytics', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1, // Don't retry analytics sync immediately, wait for next cycle
                removeOnComplete: { age: 3600, count: 500 },
                removeOnFail: { age: 86400 },
            },
        });
    }
    return analyticsQueue;
};

// Job types
export interface SchedulePostJobData {
    scheduledPostId: string;
    scheduledFor: Date;
}

export interface RetryPostJobData {
    scheduledPostId: string;
    attemptNumber: number;
}

export interface AnalyticsSyncJobData {
    daysLimit?: number;
}

export type SocialPostJobData = SchedulePostJobData | RetryPostJobData | AnalyticsSyncJobData;

/**
 * Schedule a post to be published at a specific time.
 *
 * TIMEZONE CONTRACT (audit §7): `scheduledFor` is an ABSOLUTE INSTANT, not a
 * wall-clock time. Every creation path resolves the user's chosen wall-clock
 * time against the browser's local zone and serialises it with
 * `Date#toISOString()` (always `…Z`, UTC) before it reaches the API:
 *   - composer  → `src/app/(app)/social/create-post/page.tsx`
 *   - bulk      → `src/app/(app)/social/create-post/bulk/page.tsx` (datetime-local
 *                 → `new Date(value).toISOString()`)
 *   - draft     → `src/app/api/social/posts/schedule-from-draft/route.ts`
 *   - agent     → `src/lib/agent/tools/social-tools.ts`
 * The API routes parse it with `new Date(scheduledFor)`, which is the exact
 * absolute instant. `scheduledPost.timezone` is therefore DISPLAY-ONLY metadata
 * (the IANA zone the user picked the time in) — it must NOT be applied here.
 * Re-interpreting `scheduledFor` against that zone would double-shift the time.
 * Delay below is computed straight from the absolute instant, which is correct.
 */
export async function schedulePost(
    scheduledPostId: string,
    scheduledFor: Date
): Promise<Job<SchedulePostJobData> | null> {
    try {
        const queue = getSocialPostsQueue();
        const delay = Math.max(0, new Date(scheduledFor).getTime() - Date.now());

        return await queue.add(
            'publish-scheduled-post',
            { scheduledPostId, scheduledFor },
            {
                delay,
                jobId: `scheduled-post-${scheduledPostId}`,
            }
        );
    } catch (error: unknown) {
        console.warn(`[Queue Warning] Could not schedule post ${scheduledPostId} (Redis might be down):`, error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Schedule a retry for a failed post
 */
export async function scheduleRetry(
    scheduledPostId: string,
    attemptNumber: number,
    delayMs: number = 60000 // Default 1 minute delay
): Promise<Job<RetryPostJobData>> {
    const queue = getSocialPostsQueue();

    return queue.add(
        'retry-failed-post',
        { scheduledPostId, attemptNumber },
        {
            delay: delayMs,
            jobId: `retry-post-${scheduledPostId}-attempt-${attemptNumber}`,
        }
    );
}

/**
 * Cancel a scheduled job
 */
export async function cancelScheduledPost(scheduledPostId: string): Promise<boolean> {
    try {
        const queue = getSocialPostsQueue();
        const jobId = `scheduled-post-${scheduledPostId}`;

        const job = await queue.getJob(jobId);
        if (job) {
            await job.remove();
            return true;
        }
        return false;
    } catch (error: unknown) {
        console.warn(`[Queue Warning] Could not cancel job for post ${scheduledPostId} (Redis might be down):`, error instanceof Error ? error.message : String(error));
        return false;
    }
}

/**
 * Reschedule a post to a new time
 */
export async function reschedulePost(
    scheduledPostId: string,
    newScheduledFor: Date
): Promise<Job<SchedulePostJobData> | null> {
    try {
        // Cancel existing job
        await cancelScheduledPost(scheduledPostId);

        // Create new job with new time
        return await schedulePost(scheduledPostId, newScheduledFor);
    } catch (error: unknown) {
        console.warn(`[Queue Warning] Could not reschedule post ${scheduledPostId} (Redis might be down):`, error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Schedule a recurring analytics sync job
 */
export async function scheduleAnalyticsSync(daysLimit: number = 30): Promise<void> {
    const queue = getAnalyticsQueue();

    // Add a repeatable job (every 4 hours)
    await queue.add(
        'sync-all-metrics',
        { daysLimit },
        {
            repeat: {
                pattern: '0 */4 * * *', // Every 4 hours
            },
            jobId: 'social-analytics-sync-repeat',
        }
    );
}

/**
 * Trigger an immediate analytics sync
 */
export async function triggerImmediateAnalyticsSync(daysLimit: number = 30): Promise<Job<AnalyticsSyncJobData>> {
    const queue = getAnalyticsQueue();
    return queue.add('sync-all-metrics', { daysLimit });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}> {
    const queue = getSocialPostsQueue();

    const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
}

/**
 * Cleanup function for graceful shutdown
 */
export async function closeQueue(): Promise<void> {
    if (socialPostsQueue) {
        await socialPostsQueue.close();
        socialPostsQueue = null;
    }
    if (agentTasksQueue) {
        await agentTasksQueue.close();
        agentTasksQueue = null;
    }
    if (agentMissionRunnerQueue) {
        await agentMissionRunnerQueue.close();
        agentMissionRunnerQueue = null;
    }
    if (marketingPlanReviewQueue) {
        await marketingPlanReviewQueue.close();
        marketingPlanReviewQueue = null;
    }
    if (integrationTokenRefreshQueue) {
        await integrationTokenRefreshQueue.close();
        integrationTokenRefreshQueue = null;
    }
    if (sourceMetricsQueue) {
        await sourceMetricsQueue.close();
        sourceMetricsQueue = null;
    }
    if (notionDocSyncQueue) {
        await notionDocSyncQueue.close();
        notionDocSyncQueue = null;
    }
    if (crmTrashPurgeQueue) {
        await crmTrashPurgeQueue.close();
        crmTrashPurgeQueue = null;
    }
    connectionOptions = null;
}

// ── CRM Trash Purge Queue ─────────────────────────────────

export const getCrmTrashPurgeQueue = (): Queue => {
    if (!crmTrashPurgeQueue) {
        crmTrashPurgeQueue = new Queue('crm-trash-purge', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 7 * 86400, count: 30 },
                removeOnFail: { age: 14 * 86400 },
            },
        });
    }
    return crmTrashPurgeQueue;
};

/**
 * Register the daily CRM trash purge (every day at 3 AM). Hard-deletes
 * soft-deleted CRM records older than the retention window.
 */
export async function scheduleCrmTrashPurge(): Promise<void> {
    try {
        const queue = getCrmTrashPurgeQueue();
        await queue.add(
            'purge-expired-trash',
            { trigger: 'cron' },
            {
                repeat: { pattern: '0 3 * * *' }, // Daily at 3 AM
                jobId: 'crm-trash-purge-daily',
            }
        );
        console.log('[Queue] CRM trash purge cron registered (daily, 3 AM)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register CRM trash purge cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}

/**
 * Get or create the agent scheduled tasks queue
 */
export const getAgentTasksQueue = (): Queue => {
    if (!agentTasksQueue) {
        agentTasksQueue = new Queue('agent-scheduled-tasks', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { age: 86400, count: 500 },
                removeOnFail: { age: 7 * 86400 },
            },
        });
    }
    return agentTasksQueue;
};

export interface AgentTaskJobData {
    trigger: 'cron';
}

/**
 * Set up the repeatable agent task processor (runs every 5 minutes)
 */
export async function scheduleAgentTasksProcessing(): Promise<void> {
    try {
        const queue = getAgentTasksQueue();
        await queue.add(
            'process-scheduled-tasks',
            { trigger: 'cron' },
            {
                repeat: { pattern: '*/5 * * * *' },
                jobId: 'agent-tasks-cron',
            }
        );
        console.log('[Queue] Agent scheduled tasks cron registered (every 5 min)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register agent tasks cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}

// ── Agent Mission Runner Queue ────────────────────────────

export const getAgentMissionRunnerQueue = (): Queue => {
    if (!agentMissionRunnerQueue) {
        agentMissionRunnerQueue = new Queue('agent-mission-runner', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1, // Don't auto-retry; the worker handles retries via per-tool budget
                removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
                removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
            },
        });
    }
    return agentMissionRunnerQueue;
};

export interface AgentMissionRunnerJob {
    missionId: string;
    userId: string;
    brandId: string;
    /** Optional nudge for the next turn. Usually empty — the model continues from prior context. */
    continuationPrompt?: string;
    /** Iteration counter for safety; the worker bumps it. */
    iteration?: number;
}

/**
 * Enqueue a mission auto-continuation.
 *
 * jobId MUST be unique per enqueue (2026-06-06 fix): BullMQ silently ignores
 * an add() whose jobId matches a COMPLETED job retained by removeOnComplete —
 * with the old `mission-runner-<missionId>` id the autonomous loop died after
 * exactly one turn. Parallel double-runs are instead guarded in the worker
 * (stop-status + mode checks at the top of processMissionContinuation).
 */
export async function dispatchMissionContinuation(
    payload: AgentMissionRunnerJob,
    delayMs: number = 1000,
): Promise<Job<AgentMissionRunnerJob> | null> {
    try {
        const queue = getAgentMissionRunnerQueue();
        return await queue.add(
            'continue-mission',
            payload,
            {
                jobId: `mission-runner-${payload.missionId}-i${payload.iteration ?? 0}-${Date.now()}`,
                delay: Math.max(0, delayMs),
            },
        );
    } catch (error) {
        const err = error as { message?: string };
        console.warn(`[Queue Warning] Could not enqueue mission continuation for ${payload.missionId}:`, err.message);
        return null;
    }
}

// ── Marketing Plan Review Queue ───────────────────────────

export const getMarketingPlanReviewQueue = (): Queue => {
    if (!marketingPlanReviewQueue) {
        marketingPlanReviewQueue = new Queue('marketing-plan-review', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 10000 },
                removeOnComplete: { age: 7 * 86400, count: 100 },
                removeOnFail: { age: 14 * 86400 },
            },
        });
    }
    return marketingPlanReviewQueue;
};

export interface MarketingPlanReviewJobData {
    trigger: 'cron' | 'manual';
}

/**
 * Schedule weekly marketing plan review (every Monday at 9 AM)
 * Creates AgentScheduledTasks for each active brand with roadmaps
 */
export async function scheduleMarketingPlanReview(): Promise<void> {
    try {
        const queue = getMarketingPlanReviewQueue();
        await queue.add(
            'review-marketing-plans',
            { trigger: 'cron' },
            {
                repeat: { pattern: '0 9 * * 1' }, // Every Monday at 9 AM
                jobId: 'marketing-plan-review-weekly',
            }
        );
        console.log('[Queue] Marketing plan review cron registered (weekly, Monday 9 AM)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register marketing plan review cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}

// ── Notification Digest Queue ─────────────────────────────

export const getNotificationDigestQueue = (): Queue => {
    if (!notificationDigestQueue) {
        notificationDigestQueue = new Queue('notification-digest', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 7 * 86400, count: 50 },
                removeOnFail: { age: 14 * 86400 },
            },
        });
    }
    return notificationDigestQueue;
};

/**
 * Register the daily notification email digest (every day at 8 AM).
 */
export async function scheduleNotificationDigest(): Promise<void> {
    try {
        const queue = getNotificationDigestQueue();
        await queue.add(
            'send-daily-digest',
            { trigger: 'cron' },
            {
                repeat: { pattern: '0 8 * * *' }, // Daily at 8 AM
                jobId: 'notification-digest-daily',
            }
        );
        // Agent daily briefing (Phase 1 2026-06-05) — per-brand "what your
        // agent did" digest, an hour after the notification digest.
        await queue.add(
            'send-agent-briefing',
            { trigger: 'cron' },
            {
                repeat: { pattern: '0 9 * * *' }, // Daily at 9 AM
                jobId: 'agent-briefing-daily',
            }
        );
        console.log('[Queue] Notification digest cron registered (daily, 8 AM) + agent briefing (daily, 9 AM)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register notification digest cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}

// ── Source Metrics Sync Queue (ads / GA4 / GSC / social account-level) ──

export const getSourceMetricsQueue = (): Queue => {
    if (!sourceMetricsQueue) {
        sourceMetricsQueue = new Queue('source-metrics-sync', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1, // Don't retry immediately — wait for the next cycle
                removeOnComplete: { age: 86400, count: 200 },
                removeOnFail: { age: 7 * 86400 },
            },
        });
    }
    return sourceMetricsQueue;
};

export interface SourceMetricsSyncJobData {
    trigger?: 'cron' | 'manual' | 'backfill';
    /** sync-one-source only */
    sourceType?: string;
    connectionId?: string;
    /** Look-back window in days */
    days?: number;
}

/**
 * Register the recurring source-metrics sync (every 6 hours, offset from
 * the post-level social-analytics cron that runs every 4 hours).
 */
export async function scheduleSourceMetricsSync(): Promise<void> {
    try {
        const queue = getSourceMetricsQueue();
        await queue.add(
            'sync-all-sources',
            { trigger: 'cron', days: 3 },
            {
                repeat: { pattern: '30 */6 * * *' }, // Every 6 hours at :30
                jobId: 'source-metrics-sync-cron',
            }
        );
        console.log('[Queue] Source metrics sync cron registered (every 6 h)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register source metrics sync cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}

// ── Notion Doc Sync Queue ─────────────────────────────────

export const getNotionDocSyncQueue = (): Queue => {
    if (!notionDocSyncQueue) {
        notionDocSyncQueue = new Queue('notion-doc-sync', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1, // Per-link errors are recorded on the link; next cycle retries
                removeOnComplete: { age: 86400, count: 200 },
                removeOnFail: { age: 7 * 86400 },
            },
        });
    }
    return notionDocSyncQueue;
};

/**
 * Register the recurring Notion doc sync (every 15 minutes). Notion has no
 * public change webhooks, so linked docs are polled.
 */
export async function scheduleNotionDocSync(): Promise<void> {
    try {
        const queue = getNotionDocSyncQueue();
        await queue.add(
            'sync-all-docs',
            { trigger: 'cron' },
            {
                repeat: { pattern: '*/15 * * * *' },
                jobId: 'notion-doc-sync-cron',
            }
        );
        console.log('[Queue] Notion doc sync cron registered (every 15 min)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register Notion doc sync cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}

/**
 * Enqueue a near-instant push of one document to its linked Notion page.
 * The fixed jobId debounces rapid saves: BullMQ ignores re-adds while the
 * delayed job is still queued, so a burst of edits collapses into one push
 * ~60s after the last save. Redis down = warn, no throw.
 */
export async function enqueueNotionDocPush(documentId: string): Promise<Job | null> {
    try {
        const queue = getNotionDocSyncQueue();
        return await queue.add(
            'sync-one-doc',
            { documentId },
            {
                delay: 60_000,
                jobId: `notion-push-${documentId}`,
                removeOnComplete: true,
                removeOnFail: true,
            }
        );
    } catch (error: unknown) {
        console.warn(`[Queue Warning] Could not enqueue Notion push for doc ${documentId} (Redis might be down):`, error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Register the weekly ads summary (Mondays 9 AM) on the source-metrics
 * queue — computed WoW stats, no AI credits.
 */
export async function scheduleAdsWeeklySummary(): Promise<void> {
    try {
        const queue = getSourceMetricsQueue();
        await queue.add(
            'ads-weekly-summary',
            { trigger: 'cron' },
            {
                repeat: { pattern: '0 9 * * 1' }, // Mondays at 9 AM
                jobId: 'ads-weekly-summary-cron',
            }
        );
        console.log('[Queue] Ads weekly summary cron registered (Mondays 9 AM)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register ads weekly summary cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}

/**
 * Enqueue a one-off sync for a single connection (initial 90-day backfill
 * after connecting, or a manual "Sync now"). Deduped per connection.
 */
export async function enqueueSourceMetricsSync(
    sourceType: string,
    connectionId: string,
    days: number,
    trigger: 'manual' | 'backfill' = 'manual',
): Promise<Job<SourceMetricsSyncJobData> | null> {
    try {
        const queue = getSourceMetricsQueue();
        return await queue.add(
            'sync-one-source',
            { trigger, sourceType, connectionId, days },
            { jobId: `source-sync-${connectionId}-${trigger}` }
        );
    } catch (error: unknown) {
        console.warn(`[Queue Warning] Could not enqueue source sync for ${connectionId} (Redis might be down):`, error instanceof Error ? error.message : String(error));
        return null;
    }
}

// ── Integration Token Refresh Queue ───────────────────────

export const getIntegrationTokenRefreshQueue = (): Queue => {
    if (!integrationTokenRefreshQueue) {
        integrationTokenRefreshQueue = new Queue('integration-token-refresh', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 86400, count: 100 },
                removeOnFail: { age: 7 * 86400 },
            },
        });
    }
    return integrationTokenRefreshQueue;
};

/**
 * Register the integration OAuth token refresh cron (every 10 minutes).
 * Short-lived tokens (HubSpot ~30 min, Airtable 60 min) depend on this.
 */
export async function scheduleIntegrationTokenRefresh(): Promise<void> {
    try {
        const queue = getIntegrationTokenRefreshQueue();
        await queue.add(
            'refresh-expiring-tokens',
            { trigger: 'cron' },
            {
                repeat: { pattern: '*/10 * * * *' },
                jobId: 'integration-token-refresh-cron',
            }
        );
        console.log('[Queue] Integration token refresh cron registered (every 10 min)');
    } catch (error: unknown) {
        console.warn('[Queue] Could not register integration token refresh cron (Redis might be down):', error instanceof Error ? error.message : String(error));
    }
}
