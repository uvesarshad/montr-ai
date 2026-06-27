/**
 * Workflow execution worker entrypoint.
 *
 * Run as a separate process from the Next.js server. Boots Mongo + the BullMQ
 * worker and holds the process open until a shutdown signal arrives. Use:
 *
 *   npx tsx scripts/workflow-worker.ts
 *
 * Environment:
 *   - MongoDB: whatever MONGODB_URI / MONGO_URL your app already uses
 *   - Redis:   REDIS_URL (or REDIS_HOST + REDIS_PORT + REDIS_PASSWORD)
 *   - WORKFLOW_WORKER_CONCURRENCY: integer, default 5
 */

import 'dotenv/config';
import * as Sentry from '@sentry/node';

// Initialize Sentry as early as possible. An empty DSN is a safe no-op.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
});

process.on('unhandledRejection', (e) => Sentry.captureException(e));

import { startExecutionWorker, stopExecutionWorker } from '../src/lib/workflow/queue/worker';
import { syncAllScheduledWorkflows } from '../src/lib/workflow/queue/scheduler';
import { startPollingWorker, stopPollingWorker } from '../src/lib/workflow/queue/polling-worker';
import { syncAllPollingWorkflows } from '../src/lib/workflow/queue/polling-scheduler';
import { dbConnect } from '../src/lib/db/connect';

async function main() {
  console.log('[workflow-worker] Booting…');
  await dbConnect();
  console.log('[workflow-worker] Mongo connected.');

  const worker = startExecutionWorker();
  if (!worker) {
    console.error('[workflow-worker] Redis not configured — cannot start worker. Exiting.');
    process.exit(1);
  }

  // Re-sync scheduled workflows on every boot. Cron patterns may have changed
  // while the worker was down; BullMQ's upsertJobScheduler reconciles idempotently.
  try {
    await syncAllScheduledWorkflows();
  } catch (err) {
    console.error('[workflow-worker] Schedule sync failed:', err);
  }

  // Polling triggers (audit H5): start the poll-queue consumer and re-sync the
  // per-workflow repeatable poll jobs (one fetcher tick → diff cursor → enqueue
  // executions for new items). Orphaned poll schedules are pruned in the sync.
  try {
    startPollingWorker();
    await syncAllPollingWorkflows();
  } catch (err) {
    console.error('[workflow-worker] Polling trigger setup failed:', err);
  }

  // Notification email digest: register the daily cron + start its consumer.
  try {
    const { scheduleNotificationDigest } = await import('../src/lib/queue/queue');
    const { createNotificationDigestWorker } = await import('../src/lib/queue/worker');
    await scheduleNotificationDigest();
    createNotificationDigestWorker();
  } catch (err) {
    console.error('[workflow-worker] Notification digest setup failed:', err);
  }

  // Agent mission triggers (Phase 2 2026-06-05): subscribe this process to
  // CRM + domain events so triggered missions also fire for events emitted
  // from worker-side code (workflow executions, syncs).
  try {
    const { registerMissionTriggerSubscriber } = await import('../src/lib/agent/mission-trigger-service');
    registerMissionTriggerSubscriber();
  } catch (err) {
    console.error('[workflow-worker] Mission trigger subscriber setup failed:', err);
  }

  // Agent queues (2026-06-06): these consumers were started NOWHERE before —
  // the 5-minute agent-tasks cron (scheduled tool runs, recurring missions,
  // hibernating-mission wake) and the autonomous mission runner now live in
  // this process. (scripts/agent-mission-runner-worker.ts remains available
  // as a dedicated process; BullMQ tolerates multiple consumers.)
  try {
    const { scheduleAgentTasksProcessing } = await import('../src/lib/queue/queue');
    const { createAgentTasksWorker, createAgentMissionRunnerWorker } = await import('../src/lib/queue/worker');
    await scheduleAgentTasksProcessing();
    createAgentTasksWorker();
    createAgentMissionRunnerWorker();
  } catch (err) {
    console.error('[workflow-worker] Agent queue worker setup failed:', err);
  }

  // Social publishing (audit C1 2026-06-06): these consumers were started
  // NOWHERE before — scheduled posts enqueued delayed jobs into the
  // `social-posts` queue that nothing consumed, so posts never published.
  // Boot the social-posts worker + the social-analytics sync worker, and
  // register the 4-hour analytics sync cron.
  try {
    const { scheduleAnalyticsSync } = await import('../src/lib/queue/queue');
    const { createSocialPostsWorker, createAnalyticsWorker } = await import('../src/lib/queue/worker');
    createSocialPostsWorker();
    createAnalyticsWorker();
    await scheduleAnalyticsSync();
  } catch (err) {
    console.error('[workflow-worker] Social posts/analytics worker setup failed:', err);
  }

  // Social due-post recovery + stall sweeper (audit C2 2026-06-06): 5-minute
  // cron that re-enqueues overdue `scheduled` posts whose delayed BullMQ job
  // was lost (Redis flush/eviction) and fails-out posts stuck in `publishing`
  // (worker died mid-publish). Redis-locked, one sweep per tick.
  try {
    const { scheduleSocialPostSweeper, createSocialPostSweeperWorker } = await import(
      '../src/lib/queue/social-post-sweeper'
    );
    await scheduleSocialPostSweeper();
    createSocialPostSweeperWorker();
  } catch (err) {
    console.error('[workflow-worker] Social post sweeper setup failed:', err);
  }

  // Social-account OAuth token refresh (audit C6 2026-06-06): 15-minute cron
  // that refreshes expiring social access tokens via each platform's OAuth
  // config, marks accounts `expired` + notifies admins/owner on refresh
  // failure. Redis-locked, one refresh per tick.
  try {
    const { scheduleSocialTokenRefresh, createSocialTokenRefreshWorker } = await import(
      '../src/lib/queue/social-token-refresh'
    );
    await scheduleSocialTokenRefresh();
    createSocialTokenRefreshWorker();
  } catch (err) {
    console.error('[workflow-worker] Social token refresh setup failed:', err);
  }

  // Social RSS autopost (Epic 4.1): 15-minute cron that fetches each enabled
  // RSS source, dedupes against the last-seen item, generates a caption via the
  // AI layer, and creates a draft (or routes through approval). Redis-locked.
  try {
    const { scheduleSocialAutopost, createSocialAutopostWorker } = await import(
      '../src/lib/queue/social-autopost'
    );
    await scheduleSocialAutopost();
    createSocialAutopostWorker();
  } catch (err) {
    console.error('[workflow-worker] Social autopost setup failed:', err);
  }

  // Integration OAuth token refresh: register the 10-minute cron + consumer.
  try {
    const { scheduleIntegrationTokenRefresh } = await import('../src/lib/queue/queue');
    const { createIntegrationTokenRefreshWorker } = await import('../src/lib/queue/worker');
    await scheduleIntegrationTokenRefresh();
    createIntegrationTokenRefreshWorker();
  } catch (err) {
    console.error('[workflow-worker] Integration token refresh setup failed:', err);
  }

  // Source metrics sync (ads / GA4 / GSC / social account-level): 6-hourly cron
  // + weekly ads summary cron, one consumer for both.
  try {
    const { scheduleSourceMetricsSync, scheduleAdsWeeklySummary } = await import('../src/lib/queue/queue');
    const { createSourceMetricsSyncWorker } = await import('../src/lib/queue/worker');
    await scheduleSourceMetricsSync();
    await scheduleAdsWeeklySummary();
    createSourceMetricsSyncWorker();
  } catch (err) {
    console.error('[workflow-worker] Source metrics sync setup failed:', err);
  }

  // Notion doc sync: 15-minute polling cron + consumer.
  try {
    const { scheduleNotionDocSync } = await import('../src/lib/queue/queue');
    const { createNotionDocSyncWorker } = await import('../src/lib/queue/worker');
    await scheduleNotionDocSync();
    createNotionDocSyncWorker();
  } catch (err) {
    console.error('[workflow-worker] Notion doc sync setup failed:', err);
  }

  // CRM trash purge: register the daily 3 AM cron + start its consumer.
  try {
    const { scheduleCrmTrashPurge } = await import('../src/lib/queue/queue');
    const { createCrmTrashPurgeWorker } = await import('../src/lib/queue/worker');
    await scheduleCrmTrashPurge();
    createCrmTrashPurgeWorker();
  } catch (err) {
    console.error('[workflow-worker] CRM trash purge setup failed:', err);
  }

  // Crash/stall reconciler (audit finding C2): 5-minute cron that fails
  // executions stuck RUNNING past their timeout (worker crash) and re-enqueues
  // PAUSED runs whose resume time has passed (lost delayed jobs after a Redis
  // flush/eviction). Guarded by a Redis lock so only one worker sweeps per tick.
  try {
    const { scheduleExecutionSweeper, createExecutionSweeperWorker } = await import(
      '../src/lib/workflow/queue/execution-sweeper'
    );
    await scheduleExecutionSweeper();
    createExecutionSweeperWorker();
  } catch (err) {
    console.error('[workflow-worker] Execution sweeper setup failed:', err);
  }

  // Execution history retention pruner (audit finding H4): daily cron that
  // deletes terminal executions older than each org's plan retention window
  // (completed/cancelled vs failed) plus a hard per-org row cap. Plan-driven —
  // missing/-1 fields keep forever. Guarded by a Redis lock so only one worker
  // prunes per tick.
  try {
    const { scheduleExecutionPruner, createExecutionPrunerWorker } = await import(
      '../src/lib/workflow/queue/execution-pruner'
    );
    await scheduleExecutionPruner();
    createExecutionPrunerWorker();
  } catch (err) {
    console.error('[workflow-worker] Execution pruner setup failed:', err);
  }

  const shutdown = async (signal: string) => {
    console.log(`[workflow-worker] ${signal} received — shutting down…`);
    try {
      await stopExecutionWorker();
      await stopPollingWorker();
      await Sentry.flush(2000).catch(() => {});
      console.log('[workflow-worker] Worker stopped. Goodbye.');
      process.exit(0);
    } catch (err) {
      console.error('[workflow-worker] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(async (err) => {
  console.error('[workflow-worker] Fatal boot error:', err);
  Sentry.captureException(err);
  await Sentry.flush(2000).catch(() => {});
  process.exit(1);
});
