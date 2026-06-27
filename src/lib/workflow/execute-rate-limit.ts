/**
 * Per-organization execute() rate limiter.
 *
 * Protects the workflow runtime from runaway clients (and from accidental
 * cron-storms) by capping how many `/canvases/[id]/execute` calls a single
 * organization can make in a sliding window.
 *
 * Backed by Redis when available; falls back to an in-process LRU map so the
 * limit still applies in single-node dev environments.
 */

import { getRedisClient, isRedisAvailable } from '../redis';

const WINDOW_SECONDS = 60;
const MAX_PER_WINDOW = 30; // 30 executions / org / minute

export interface ExecuteRateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
}

// In-memory fallback. Capped to avoid unbounded growth in long-lived processes.
const MAX_LOCAL_KEYS = 5000;
const localCounts = new Map<string, number[]>();

function pruneLocal(orgId: string, now: number) {
    const cutoff = now - WINDOW_SECONDS;
    const arr = localCounts.get(orgId) || [];
    const filtered = arr.filter(t => t > cutoff);
    if (filtered.length === 0) {
        localCounts.delete(orgId);
    } else {
        localCounts.set(orgId, filtered);
    }
    if (localCounts.size > MAX_LOCAL_KEYS) {
        // Drop the oldest key to bound memory usage.
        const firstKey = localCounts.keys().next().value;
        if (firstKey !== undefined) localCounts.delete(firstKey);
    }
}

function localCheck(orgId: string): ExecuteRateLimitResult {
    const now = Math.floor(Date.now() / 1000);
    pruneLocal(orgId, now);
    const arr = localCounts.get(orgId) || [];
    if (arr.length >= MAX_PER_WINDOW) {
        const oldest = arr[0];
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, oldest + WINDOW_SECONDS - now),
        };
    }
    arr.push(now);
    localCounts.set(orgId, arr);
    return {
        allowed: true,
        remaining: MAX_PER_WINDOW - arr.length,
        retryAfterSeconds: 0,
    };
}

export async function checkExecuteRateLimit(
    organizationId: string
): Promise<ExecuteRateLimitResult> {
    const key = `ratelimit:canvas-execute:${organizationId}`;

    try {
        const redisUp = await isRedisAvailable();
        if (!redisUp) return localCheck(organizationId);

        const redis = getRedisClient();
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - WINDOW_SECONDS;

        await redis.zremrangebyscore(key, 0, windowStart);
        const count = await redis.zcard(key);

        if (count >= MAX_PER_WINDOW) {
            const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
            const oldestTime = oldest.length > 1 ? parseInt(oldest[1], 10) : now;
            return {
                allowed: false,
                remaining: 0,
                retryAfterSeconds: Math.max(1, oldestTime + WINDOW_SECONDS - now),
            };
        }

        await redis.zadd(key, now, `${now}:${Math.random()}`);
        await redis.expire(key, WINDOW_SECONDS);

        return {
            allowed: true,
            remaining: MAX_PER_WINDOW - count - 1,
            retryAfterSeconds: 0,
        };
    } catch (error) {
        console.error('[execute-rate-limit] Redis check failed, falling back to local:', error);
        return localCheck(organizationId);
    }
}
