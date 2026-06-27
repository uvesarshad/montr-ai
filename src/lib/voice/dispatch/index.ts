/**
 * Voice dispatch + worker tier — public barrel.
 *
 * Phase 2: a horizontally-scalable, load-aware dispatch + worker tier modeled
 * on LiveKit Agents' worker/dispatch pattern, built on MontrAI's existing
 * BullMQ + Redis stack.
 *
 *   • call-queue      — the `voice-call` BullMQ queue + `CallJob` contract.
 *   • dispatcher      — `enqueueCall`: org-scoped admission + enqueue.
 *   • call-worker     — the BullMQ consumer that owns the live media bridge.
 *   • worker-registry — Redis-hash fleet registry + heartbeat + reaper.
 *   • load            — per-worker load computation + availability gate.
 *
 * Inbound-webhook / outbound-dialer / bulk-campaign paths should call
 * `enqueueCall` instead of attaching a media bridge in-process.
 */

// Queue + job contract
export {
  VOICE_CALL_QUEUE_NAME,
  VOICE_CALL_JOB_NAME,
  getCallQueue,
  getCallQueueEvents,
  isCallQueueConfigured,
  addCallJob,
} from './call-queue';
export type { CallJob } from './call-queue';

// Dispatcher (admission + enqueue)
export {
  enqueueCall,
  releaseOrgCallSlot,
  CallConcurrencyExceededError,
  CallScopeError,
} from './dispatcher';
export type { EnqueueCallResult } from './dispatcher';

// Worker lifecycle
export {
  startCallWorker,
  stopCallWorker,
  getWorkerId,
  getWorkerStatus,
  DRAIN_TIMEOUT_MS,
} from './call-worker';
export type { CallJobResult } from './call-worker';

// Worker registry (fleet view)
export {
  WORKER_REGISTRY_KEY,
  WORKER_HEARTBEAT_MS,
  WORKER_TTL_MS,
  registerWorker,
  heartbeat,
  markDraining,
  deregisterWorker,
  listWorkers,
  listAvailableWorkers,
  reapDeadWorkers,
} from './worker-registry';
export type { WorkerEntry, WorkerMeta } from './worker-registry';

// Load model
export {
  computeLoad,
  isAvailable,
  sampleCpuLoad,
  DEFAULT_LOAD_THRESHOLD,
} from './load';
export type { LoadInputs, LoadSample } from './load';
