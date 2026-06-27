import { NextResponse } from 'next/server';
import type { Queue } from 'bullmq';
import {
    getSocialPostsQueue,
    getAnalyticsQueue,
    getAgentTasksQueue,
    getAgentMissionRunnerQueue,
    getMarketingPlanReviewQueue,
} from '@/lib/queue/queue';
import { isRedisAvailable } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * Worker heartbeat / queue health.
 *
 *   GET /api/v2/health/workers
 *
 * Returns BullMQ queue depths (waiting/active/completed/failed/delayed) for
 * each registered queue, plus the Redis connection status. Used by ops
 * dashboards and external uptime checks; a queue with growing `waiting` or
 * `failed` counts means the worker isn't keeping up (or isn't running).
 *
 * The route is intentionally unauthenticated — same posture as `/api/v2/health`
 * — but returns no sensitive data, only depth counts.
 */
export const dynamic = 'force-dynamic';

interface QueueSnapshot {
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    error?: string;
}

async function snapshotQueue(name: string, getter: () => Queue): Promise<QueueSnapshot> {
    try {
        const queue = getter();
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        return {
            name,
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
            delayed: counts.delayed || 0,
        };
    } catch (error) {
        return {
            name,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export async function GET() {
    const startedAt = Date.now();
    let redisUp = false;
    try {
        redisUp = await isRedisAvailable();
    } catch {
        redisUp = false;
    }

    // If Redis isn't reachable there's no point asking BullMQ — return a fast
    // 503 so monitors flag the failure immediately.
    if (!redisUp) {
        return NextResponse.json(
            {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                redis: 'down',
                queues: [],
                error: 'Redis is not reachable; worker queues cannot be inspected.',
            },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    const queues = await Promise.all([
        snapshotQueue('social-posts', getSocialPostsQueue),
        snapshotQueue('social-analytics', getAnalyticsQueue),
        snapshotQueue('agent-scheduled-tasks', getAgentTasksQueue),
        snapshotQueue('agent-mission-runner', getAgentMissionRunnerQueue),
        snapshotQueue('marketing-plan-review', getMarketingPlanReviewQueue),
    ]);

    // Aggregate signals so ops can alert on the response shape directly.
    const totalWaiting = queues.reduce((sum, q) => sum + q.waiting, 0);
    const totalActive = queues.reduce((sum, q) => sum + q.active, 0);
    const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0);
    const anyErrored = queues.some(q => q.error);

    const status: 'healthy' | 'degraded' | 'unhealthy' = anyErrored
        ? 'unhealthy'
        : totalFailed > 100 || totalWaiting > 1000
            ? 'degraded'
            : 'healthy';

    const httpStatus = status === 'unhealthy' ? 503 : 200;

    if (status !== 'healthy') {
        logger.warn({
            event: 'workers.health_degraded',
            component: 'health/workers',
            status,
            totalWaiting,
            totalActive,
            totalFailed,
            anyErrored,
        });
    }

    return NextResponse.json(
        {
            status,
            timestamp: new Date().toISOString(),
            redis: 'up',
            durationMs: Date.now() - startedAt,
            totals: { waiting: totalWaiting, active: totalActive, failed: totalFailed },
            queues,
        },
        {
            status: httpStatus,
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        },
    );
}
