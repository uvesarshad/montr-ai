# Server State

> Scope: Server-side state management — BullMQ job queues and Redis-backed caching.
> Rendering context: Server-side
> Project tier: 4
> Last updated: 2026-06-06

## Overview

Server state in MontrAI is managed through three mechanisms: MongoDB as the persistent store (via Mongoose repositories), Redis as the ephemeral layer (rate limiting, pub/sub, BullMQ), and BullMQ as the background job queue. There is no Next.js fetch cache or ISR. No revalidatePath/revalidateTag patterns are used — clients rely on TanStack Query polling or Socket.io push for freshness.

## Redis

Connection: src/lib/redis.ts. Exports getRedisClient (singleton ioredis instance). Falls back to redis://localhost:6379 if REDIS_URL is not set.

Uses:
- BullMQ queue backends (src/lib/workflow/queue/connection.ts)
- Rate limiting sliding windows (src/lib/rate-limiter.ts — Redis ZADD/ZCOUNT pattern)
- Workflow event pub/sub (src/lib/workflow/events/bus.ts — channel: workflow:events)
- JWT user cache (in-process Map, not Redis — see auth.ts jwtUserCache)

AGENT NOTE: Redis is not optional in production. Rate limiting for auth routes fails closed when Redis is unavailable, returning 429. Workflow real-time events also require Redis to cross process boundaries.

## BullMQ

BullMQ (bullmq package) manages background and long-running jobs. Queues live in src/lib/workflow/queue/ and src/lib/queue/.

### Queues

Workflow execution queue (src/lib/workflow/queue/execution-queue.ts) — Enqueues UnifiedWorkflowExecution jobs. Processed by the worker (npm run worker, scripts/workflow-worker.ts). Each job carries a workflowId and executionId. On pickup, the worker calls unified-execution-engine.ts.

Inline runner (src/lib/workflow/queue/inline-runner.ts) — Runs executions synchronously in the HTTP process for short/simple workflows that don't need the worker. Falls back to the queue for anything exceeding a time threshold.

Scheduler (src/lib/workflow/queue/scheduler.ts) — Manages delayed and repeating jobs. Used by the delay node (re-enqueues with a future run time) and for scheduled workflow triggers.

WhatsApp queue (src/lib/queue/whatsapp-queue.ts) — WhatsApp message delivery jobs.

General queue (src/lib/queue/queue.ts) — General-purpose background jobs.

Worker (src/lib/workflow/queue/worker.ts) — BullMQ Worker class that picks up execution jobs and calls the engine. Run via: npm run worker (tsx scripts/workflow-worker.ts).

Agent scheduled tasks (agent-scheduled-tasks queue in src/lib/queue/queue.ts) — 5-minute repeatable cron 'process-scheduled-tasks' (jobId agent-tasks-cron, registered by scheduleAgentTasksProcessing). The consumer (createAgentTasksWorker in src/lib/queue/worker.ts) runs due agent_scheduled_tasks via processScheduledTasks AND wakes hibernating missions via wakeDueMissions (src/lib/agent/long-horizon.ts): on the same tick, missions with status 'scheduled' and wakeAt <= now flip to 'active', get sessionStartedAt stamped, usage.idleTurns reset, and either a continuation dispatched (autonomous/autopilot modes) or the owner notified (other modes).

Agent mission runner (agent-mission-runner queue in src/lib/queue/queue.ts) — 'continue-mission' jobs drive autonomous missions turn-by-turn (processMissionContinuation in src/lib/queue/worker.ts, concurrency 4). Safety stops: 100-iteration hard cap (HARD_ITERATION_CAP), idle-turn cap MAX_IDLE_TURNS=3 (no tool calls → terminate 'no_progress'), and a per-session wall-clock check. AGENT NOTE (2026-06-06): dispatchMissionContinuation now uses a UNIQUE jobId per enqueue (mission-runner-<missionId>-i<iteration>-<timestamp>) because BullMQ silently drops an add() whose jobId matches a COMPLETED job retained by removeOnComplete — the old fixed jobId killed the autonomous loop after exactly one turn. Parallel double-runs are instead guarded by the status/mode pre-checks at the top of processMissionContinuation.

Integration token refresh (integration-token-refresh queue in src/lib/queue/queue.ts) — Repeats every 10 minutes; calls src/lib/integrations/server/token-refresh.ts to preemptively refresh integrations-hub OAuth tokens expiring within 15 minutes (HubSpot tokens live ~30 minutes, Airtable 60). Registered by scripts/workflow-worker.ts; consumer in src/lib/queue/worker.ts.

Notion doc sync (notion-doc-sync queue in src/lib/queue/queue.ts) — Repeats every 15 minutes; calls syncAllNotionDocs in src/lib/integrations/notion/doc-sync.ts to poll linked documents against their Notion pages (Notion has no public change webhooks). Registered by scripts/workflow-worker.ts; consumer in src/lib/queue/worker.ts, concurrency 1 — the sync loop paces Notion API calls itself.

Source metrics sync (source-metrics-sync queue in src/lib/queue/queue.ts) — Three job types, one consumer (src/lib/queue/worker.ts, concurrency 1 to respect platform rate limits): sync-all-sources (cron 30 */6 * * * — re-pulls a 3-day window across every connected ad account, GA4 property, GSC site, and account-level social profile so late ads-attribution data settles), sync-one-source (one-off 90-day backfill enqueued on connect, or manual "Sync now" via POST /api/v2/analytics/sync), and ads-weekly-summary (cron Mondays 9 AM — computed week-over-week spend/clicks/conversions per org, published as ads.weekly_summary domain events; no AI involved). Drives src/lib/analytics/sync-service.ts → fetchers → bulk upsert into metrics_snapshots. Registered by scripts/workflow-worker.ts.

CRM trash purge (crm-trash-purge queue in src/lib/queue/queue.ts) — Daily cron (pattern 0 3 * * *, every day at 3 AM; jobId crm-trash-purge-daily) registered by scheduleCrmTrashPurge. Job purge-expired-trash calls purgeExpiredCrmTrash in src/lib/crm/trash-purge.ts, which hard-deletes soft-deleted CRM contacts/companies/deals/activities whose deletedAt is older than the 30-day retention window (TRASH_RETENTION_DAYS), across all organizations (idempotent). Registered + its consumer started by scripts/workflow-worker.ts (createCrmTrashPurgeWorker in src/lib/queue/worker.ts). AGENT SEE: docs/api/database.md — soft-delete fields (deletedAt/deletedById) on the CRM models.

Notification digest (notification-digest queue in src/lib/queue/queue.ts) — Two daily repeatable jobs registered by scheduleNotificationDigest, one consumer (createNotificationDigestWorker in src/lib/queue/worker.ts, concurrency 1): send-daily-digest (jobId notification-digest-daily, 08:00 → runDailyDigest, the per-user email digest) and send-agent-briefing (jobId agent-briefing-daily, 09:00 → runAgentBriefings in src/lib/agent/briefing.ts). The agent briefing builds a per-brand "what your agent did in 24h" digest for every brand with agent activity, delivered as an in-app notification AND mirrored into the Agent Workspace as a Reports doc. Registered by scripts/workflow-worker.ts.

AGENT NOTE: Agent queue consumers run from scripts/workflow-worker.ts. As of 2026-06-06 it starts the agent-scheduled-tasks worker (createAgentTasksWorker), the agent-mission-runner worker (createAgentMissionRunnerWorker), and the notification-digest worker (which carries the agent briefing) — previously NO process consumed the agent queues, so scheduled tasks, hibernation wakes, and autonomous mission continuations never ran. scripts/agent-mission-runner-worker.ts remains as an optional dedicated runner process (BullMQ tolerates multiple consumers). PM2 (ecosystem.config.js) runs only server.js — the worker process must be added separately for production agent autonomy.

### Trigger Dispatch Guards

The trigger dispatcher (src/lib/workflow/triggers/dispatch.ts) enforces per-workflow execution guards at enqueue time, before a triggered UnifiedWorkflow run is queued: runOnce (skip if already executed once), maxExecutions (skip once the execution count reaches the cap), and cooldownMinutes (skip if lastTriggeredAt is within the cooldown window). On a successful dispatch it stamps lastTriggeredAt on the UnifiedWorkflow document.

AGENT NOTE: canvas saves materialize a UnifiedWorkflow shadow via src/lib/workflow/canvas-sync.ts; when the resolved trigger type is scheduled and the workflow is active, it (re)registers the repeatable job through registerScheduledWorkflow (src/lib/workflow/queue/scheduler.ts) so cron-triggered canvases actually fire.

### Job Retry Policy

Workflow execution jobs retry on failure up to the configured maxRetriesPerTool limit on the mission limits object. On exhaustion, the job is marked FAILED and an execution:failed Socket.io event is emitted.

## Cross-Process Communication

The BullMQ worker and the HTTP server are separate Node.js processes. Socket.io connections are held by the HTTP process. To deliver real-time updates from the worker to connected browsers:

1. Worker engine calls publishWorkflowEventAsync (src/lib/workflow/events/bus.ts).
2. bus.ts publishes a WorkflowEventEnvelope JSON to the Redis channel workflow:events.
3. HTTP process (server.js) has subscribeWorkflowEvents attached to the Socket.io server.
4. Subscriber re-emits the event into the matching Socket.io room.

AGENT NOTE: Removing or misconfiguring the Redis pub/sub bridge will silently break real-time execution feedback for workflows run on the worker. Always keep the subscriber wired in server.js.

## Execution Pause and Resume

When a workflow hits a delay node with a wait time exceeding the inline threshold:
1. The engine throws ExecutionPausedForDelay.
2. The execution record is marked PAUSED and stores a resumeFrom pointer (the next node IDs).
3. A delayed BullMQ job is enqueued with the resumeAt timestamp.
4. On job pickup, the engine reads the resumeFrom pointer and continues from there.

## Caching

JWT user cache — in-process Map<string, JwtUserSnapshot> in auth.ts. 60-second TTL. Avoids MongoDB on every request for role/org lookups. Not shared between processes.

CRM blocklist cache — in-process Map<organizationId, { patterns: Set<string>, expires }> in src/lib/db/repository/crm/blocklist.repository.ts. 60-second TTL (CACHE_TTL_MS). The blocklist is tiny and read on every synced inbound email message (auto-link / auto-create gate), so it is cached per org; mutations invalidate the org's entry. Not shared between processes.

No HTTP-level response caching is applied. No Next.js unstable_cache or fetch cache is used.

AGENT UPDATE: Update this file when the BullMQ queue configuration changes, when a new queue is added, or when the cross-process event strategy changes.

## Related Docs

- docs/infra/environment.md — REDIS_URL
- docs/architecture/data-flow.md — Workflow execution path
- docs/infra/deployment.md — Worker process management
