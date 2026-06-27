/**
 * Campaign circuit breaker (Phase 4).
 *
 * Redis ZSET-based failure detector per batch. Successes and failures are
 * recorded as members in two rolling-window ZSETs (scored by event time); over
 * a sliding window the orchestrator asks `isOpen(batchId)` and, when the failure
 * rate exceeds `failureRateThreshold` over at least `minSamples` outcomes, the
 * breaker trips — signalling the orchestrator to AUTO-PAUSE the batch (status
 * 'paused' with a reason) rather than keep hammering a dead provider/number pool.
 *
 * Modelled on dograh's CampaignOrchestrator circuit breaker: trip on a rolling
 * failure-rate, require a minimum sample so a single early failure doesn't pause
 * a fresh batch, and expose explicit reset.
 *
 * 🔒 Keys carry `organizationId` + `batchId`. Null-safe: with Redis absent the
 * breaker is permanently CLOSED (never auto-pauses) — record* calls no-op.
 */

import { getRedisConnection } from '@/lib/workflow/queue/connection';

const KEY_PREFIX = 'voice:campaign:breaker';

/** Rolling window over which outcomes are counted, in milliseconds. */
const DEFAULT_WINDOW_MS = 60_000;

/** Minimum number of outcomes in-window before the breaker can trip. */
const DEFAULT_MIN_SAMPLES = 10;

/** Failure rate (0..1) above which the breaker opens. */
const DEFAULT_FAILURE_RATE_THRESHOLD = 0.5;

export interface CircuitBreakerConfig {
  windowMs?: number;
  minSamples?: number;
  failureRateThreshold?: number;
}

function successKey(orgId: string, batchId: string): string {
  return `${KEY_PREFIX}:ok:${orgId}:${batchId}`;
}

function failureKey(orgId: string, batchId: string): string {
  return `${KEY_PREFIX}:fail:${orgId}:${batchId}`;
}

function resolve(config?: CircuitBreakerConfig) {
  return {
    windowMs: config?.windowMs ?? DEFAULT_WINDOW_MS,
    minSamples: config?.minSamples ?? DEFAULT_MIN_SAMPLES,
    failureRateThreshold: config?.failureRateThreshold ?? DEFAULT_FAILURE_RATE_THRESHOLD,
  };
}

async function record(key: string, windowMs: number): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    await redis
      .multi()
      .zadd(key, now, member)
      .zremrangebyscore(key, 0, now - windowMs)
      .pexpire(key, windowMs + 5_000)
      .exec();
  } catch (err) {
    console.error('[voice-campaign:circuit-breaker] record failed:', err);
  }
}

/** Record a successful call outcome in the rolling window. */
export async function recordSuccess(orgId: string, batchId: string, config?: CircuitBreakerConfig): Promise<void> {
  const { windowMs } = resolve(config);
  await record(successKey(orgId, batchId), windowMs);
}

/** Record a failed call outcome in the rolling window. */
export async function recordFailure(orgId: string, batchId: string, config?: CircuitBreakerConfig): Promise<void> {
  const { windowMs } = resolve(config);
  await record(failureKey(orgId, batchId), windowMs);
}

export interface BreakerState {
  open: boolean;
  successes: number;
  failures: number;
  total: number;
  failureRate: number;
}

/**
 * Evaluate the breaker. Returns OPEN (true) when the in-window failure rate
 * exceeds the threshold AND at least `minSamples` outcomes are present. With
 * Redis absent the breaker is always CLOSED (fail-open — don't pause a campaign
 * just because the breaker store is down).
 */
export async function evaluate(orgId: string, batchId: string, config?: CircuitBreakerConfig): Promise<BreakerState> {
  const { windowMs, minSamples, failureRateThreshold } = resolve(config);
  const redis = getRedisConnection();
  const closed: BreakerState = { open: false, successes: 0, failures: 0, total: 0, failureRate: 0 };
  if (!redis) return closed;

  try {
    const now = Date.now();
    const okKey = successKey(orgId, batchId);
    const failKey = failureKey(orgId, batchId);
    // Evict expired, then count, in one round-trip.
    const res = await redis
      .multi()
      .zremrangebyscore(okKey, 0, now - windowMs)
      .zremrangebyscore(failKey, 0, now - windowMs)
      .zcard(okKey)
      .zcard(failKey)
      .exec();

    const successes = Number(res?.[2]?.[1] ?? 0);
    const failures = Number(res?.[3]?.[1] ?? 0);
    const total = successes + failures;
    const failureRate = total > 0 ? failures / total : 0;
    const open = total >= minSamples && failureRate >= failureRateThreshold;
    return { open, successes, failures, total, failureRate };
  } catch (err) {
    console.error('[voice-campaign:circuit-breaker] evaluate failed:', err);
    return closed;
  }
}

/** Convenience: just the open/closed verdict. */
export async function isOpen(orgId: string, batchId: string, config?: CircuitBreakerConfig): Promise<boolean> {
  return (await evaluate(orgId, batchId, config)).open;
}

/** Clear all breaker state for a batch (on resume / terminal transitions). */
export async function reset(orgId: string, batchId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    await redis.del(successKey(orgId, batchId), failureKey(orgId, batchId));
  } catch {
    /* best-effort */
  }
}

export const CIRCUIT_BREAKER_DEFAULTS = {
  DEFAULT_WINDOW_MS,
  DEFAULT_MIN_SAMPLES,
  DEFAULT_FAILURE_RATE_THRESHOLD,
};
