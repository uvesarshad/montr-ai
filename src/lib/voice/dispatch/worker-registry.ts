/**
 * Voice worker registry (LiveKit `nodes`-registry analog).
 *
 * Every voice-call worker process advertises itself in a shared Redis hash so
 * the dispatch tier (and ops dashboards) can see the live fleet, each worker's
 * current load, and which workers are draining. This is the horizontal-scale
 * substrate: add a worker process → it registers → it starts pulling jobs.
 *
 * Storage layout (single hash, one field per worker):
 *   HASH  voice:workers
 *     <workerId> -> JSON.stringify(WorkerEntry)
 *
 * Each entry carries an `updatedAt` heartbeat timestamp. A reaper sweeps stale
 * entries (workers that died without a clean drain) so the fleet view
 * self-heals. We keep a single hash (not per-worker keys) so `listWorkers` is
 * one round-trip — the fleet is small (tens of workers, not millions).
 *
 * 🔒 All Redis access goes through the SHARED `getRedisConnection()` — never a
 * private client. Worker ids are random + process-scoped; they are NOT tenant
 * data (a worker serves all orgs), so the registry hash is not org-scoped.
 */

import type { Redis } from 'ioredis';
import { getRedisConnection } from '@/lib/workflow/queue/connection';

/** Redis hash holding the live worker fleet. */
export const WORKER_REGISTRY_KEY = 'voice:workers';

/** Heartbeat cadence — workers refresh their entry this often. */
export const WORKER_HEARTBEAT_MS = 2_500;

/** Default staleness TTL — entries older than this are reaped (~4 missed beats). */
export const WORKER_TTL_MS = 10_000;

export interface WorkerMeta {
  /** Hostname / pod identifier for ops correlation. */
  host?: string;
  /** Process id. */
  pid?: number;
  /** Hard ceiling on concurrent live sessions this worker accepts. */
  maxSessions: number;
}

export interface WorkerEntry {
  /** Unique worker id (process-scoped, random). */
  id: string;
  /** Effective 0..1 load at last heartbeat. */
  load: number;
  /** Live sessions at last heartbeat. */
  activeSessions: number;
  /** Session ceiling for this worker. */
  maxSessions: number;
  /** Hostname for ops. */
  host?: string;
  /** Process id. */
  pid?: number;
  /** Epoch ms of the last heartbeat. */
  updatedAt: number;
  /** True once the worker is shutting down — dispatch must not target it. */
  draining: boolean;
}

function parseEntry(raw: string): WorkerEntry | null {
  try {
    return JSON.parse(raw) as WorkerEntry;
  } catch {
    return null;
  }
}

/**
 * Register a worker in the fleet hash. Call once at worker boot, BEFORE the
 * BullMQ worker starts pulling jobs. No-op when Redis is absent.
 */
export async function registerWorker(id: string, meta: WorkerMeta): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  const entry: WorkerEntry = {
    id,
    load: 0,
    activeSessions: 0,
    maxSessions: meta.maxSessions,
    host: meta.host,
    pid: meta.pid,
    updatedAt: Date.now(),
    draining: false,
  };
  await redis.hset(WORKER_REGISTRY_KEY, id, JSON.stringify(entry));
}

/**
 * Refresh a worker's heartbeat with its current load snapshot. Called on the
 * `WORKER_HEARTBEAT_MS` interval. Preserves the `draining` flag if already set.
 * No-op when Redis is absent or the worker was reaped (re-registers itself).
 */
export async function heartbeat(
  id: string,
  snapshot: { load: number; activeSessions: number; maxSessions: number },
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  const existingRaw = await redis.hget(WORKER_REGISTRY_KEY, id);
  const existing = existingRaw ? parseEntry(existingRaw) : null;
  const entry: WorkerEntry = {
    id,
    load: snapshot.load,
    activeSessions: snapshot.activeSessions,
    maxSessions: snapshot.maxSessions,
    host: existing?.host,
    pid: existing?.pid,
    updatedAt: Date.now(),
    // Once draining, stay draining — heartbeats during drain keep the entry
    // alive (so dispatch can see "draining") without un-setting the flag.
    draining: existing?.draining ?? false,
  };
  await redis.hset(WORKER_REGISTRY_KEY, id, JSON.stringify(entry));
}

/** Mark a worker as draining (shutting down) so dispatch stops targeting it. */
export async function markDraining(id: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  const existingRaw = await redis.hget(WORKER_REGISTRY_KEY, id);
  const existing = existingRaw ? parseEntry(existingRaw) : null;
  if (!existing) return;
  existing.draining = true;
  existing.updatedAt = Date.now();
  await redis.hset(WORKER_REGISTRY_KEY, id, JSON.stringify(existing));
}

/** Remove a worker from the fleet hash. Call on clean shutdown. No-op sans Redis. */
export async function deregisterWorker(id: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  await redis.hdel(WORKER_REGISTRY_KEY, id);
}

/** List the current fleet. Returns [] when Redis is absent. */
export async function listWorkers(): Promise<WorkerEntry[]> {
  const redis = getRedisConnection();
  if (!redis) return [];
  const all = await redis.hgetall(WORKER_REGISTRY_KEY);
  const entries: WorkerEntry[] = [];
  for (const raw of Object.values(all)) {
    const parsed = parseEntry(raw);
    if (parsed) entries.push(parsed);
  }
  return entries;
}

/**
 * List only workers that are alive (heartbeat within `ttlMs`) and NOT draining
 * — i.e. the set the dispatcher may route new calls to.
 */
export async function listAvailableWorkers(ttlMs: number = WORKER_TTL_MS): Promise<WorkerEntry[]> {
  const now = Date.now();
  const workers = await listWorkers();
  return workers.filter((w) => !w.draining && now - w.updatedAt <= ttlMs);
}

/**
 * Reap workers whose last heartbeat is older than `ttlMs` (crashed/killed
 * without a clean drain). Returns the count removed. Safe to call from any
 * process (idempotent HDEL) — run it periodically on a Redis-locked sweep, or
 * opportunistically from each heartbeat tick on one elected worker.
 */
export async function reapDeadWorkers(ttlMs: number = WORKER_TTL_MS): Promise<number> {
  const redis = getRedisConnection();
  if (!redis) return 0;
  const now = Date.now();
  const all = await redis.hgetall(WORKER_REGISTRY_KEY);
  const dead: string[] = [];
  for (const [id, raw] of Object.entries(all)) {
    const parsed = parseEntry(raw);
    // Unparseable or stale → reap.
    if (!parsed || now - parsed.updatedAt > ttlMs) dead.push(id);
  }
  if (dead.length === 0) return 0;
  await redis.hdel(WORKER_REGISTRY_KEY, ...dead);
  return dead.length;
}

/** @internal — direct hash access for tests/ops tooling. */
export function getRegistryRedis(): Redis | null {
  return getRedisConnection();
}
