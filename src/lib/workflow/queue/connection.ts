/**
 * Shared Redis connection for BullMQ queues / workers / events.
 *
 * Returns a singleton IORedis client built from env vars. Callers should use
 * the exported `getRedisConnection()` — NOT create their own client. That keeps
 * connection count low and lets the same client drive queues, workers, and
 * Socket.IO pub/sub later.
 *
 * Env: REDIS_URL (preferred) OR REDIS_HOST + REDIS_PORT + REDIS_PASSWORD.
 * Returns `null` when Redis is not configured — callers must fall back to an
 * inline-execution path in that case (dev ergonomics).
 */

import IORedis, { Redis, RedisOptions } from 'ioredis';

let cached: Redis | null | undefined;

export function getRedisConnection(): Redis | null {
  if (cached !== undefined) return cached;

  const url = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;
  const host = process.env.REDIS_HOST;

  if (!url && !host) {
    cached = null;
    return null;
  }

  const opts: RedisOptions = {
    // BullMQ requires this — otherwise blocking commands will retry indefinitely
    // and clog the event loop on transient Redis failures.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  };

  try {
    cached = url
      ? new IORedis(url, opts)
      : new IORedis({
          host,
          port: Number(process.env.REDIS_PORT || 6379),
          password: process.env.REDIS_PASSWORD,
          db: Number(process.env.REDIS_DB || 0),
          ...opts,
        });

    cached.on('error', (err) => {
      console.error('[workflow-queue] Redis error:', err.message);
    });

    return cached;
  } catch (err) {
    console.error('[workflow-queue] Failed to create Redis connection:', err);
    cached = null;
    return null;
  }
}

/** True when a Redis instance is configured and ready to back the queue. */
export function isQueueConfigured(): boolean {
  return getRedisConnection() !== null;
}
