/**
 * Voice campaign engine (Phase 4) — barrel.
 *
 * Durable, rate-limited, fault-tolerant bulk/campaign dialer built on MontrAI's
 * BullMQ + Redis stack (dograh CampaignOrchestrator pattern). Replaces the
 * in-memory `setTimeout` loop in `bulk-dispatcher.ts` (kept as legacy fallback).
 *
 * Public surface:
 *   - enqueueCampaign / startCampaignWorker / stopCampaignWorker / resumePendingCampaigns
 *   - processCampaignTick (one dial window — exposed for tests)
 *   - rate limiter + circuit breaker primitives (namespaced)
 *   - queue accessors + job types
 */

export {
  enqueueCampaign,
  startCampaignWorker,
  stopCampaignWorker,
  resumePendingCampaigns,
  processCampaignTick,
  RETRY_DEFAULTS,
} from './campaign-orchestrator';

export {
  CAMPAIGN_QUEUE_NAME,
  CAMPAIGN_TICK_JOB,
  getCampaignQueue,
  getCampaignQueueEvents,
  enqueueTick,
  tickJobId,
} from './campaign-queue';
export type { CampaignTickJob } from './campaign-queue';

export * as campaignRateLimiter from './rate-limiter';
export * as campaignCircuitBreaker from './circuit-breaker';
