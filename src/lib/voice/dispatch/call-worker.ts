/**
 * Voice call worker — the load-aware media tier (LiveKit `Worker` analog).
 *
 * A BullMQ consumer on the `voice-call` queue. Each job is a hand-off: "drive
 * the media for this call_session". The worker:
 *
 *   1. **Load-aware admission** — if this worker is over its load threshold,
 *      `moveToDelayed` + throw `DelayedError` so another (less-loaded) worker
 *      picks the call up. This MIRRORS the workflow worker's per-org-cap defer.
 *   2. **Claim a session slot** — bump the worker's active-session count +
 *      registry, and the per-org admission counter is owned by the dispatcher
 *      (released here on completion).
 *   3. **Resolve provider + credential** via `getProviderForCall` /
 *      `getVoiceProvider` (NEVER provider SDKs directly).
 *   4. **Attach the media bridge** — for `media_stream` providers, accept the
 *      per-call Twilio Media Stream WS and call the EXISTING
 *      `attachTwilioMediaBridge` (reused, not rewritten). For `call_control`
 *      providers, a Phase-8 stub.
 *   5. **Release** the session slot + decrement registry + free the org
 *      admission slot on completion.
 *
 * The media WS is per-call and arrives AFTER the job is admitted (the provider
 * connects to `…/media-stream/<callSessionId>`). The worker runs its own WS
 * server (same upgrade contract as `server/ws-handler.ts`) and parks each
 * admitted job until its media socket connects (or a connect timeout fires).
 *
 * Concurrency is configurable via `VOICE_WORKER_CONCURRENCY` (default 5); the
 * registry's `maxSessions` mirrors it.
 */

import http from 'http';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { Worker, Job, ConnectionOptions, DelayedError } from 'bullmq';

import { getRedisConnection } from '@/lib/workflow/queue/connection';
import { VOICE_CALL_QUEUE_NAME, type CallJob } from './call-queue';
import { releaseOrgCallSlot } from './dispatcher';
import {
  computeLoad,
  isAvailable,
  DEFAULT_LOAD_THRESHOLD,
} from './load';
import {
  registerWorker,
  heartbeat,
  markDraining,
  deregisterWorker,
  reapDeadWorkers,
  WORKER_HEARTBEAT_MS,
  WORKER_TTL_MS,
} from './worker-registry';

import { getProviderForCall } from '@/lib/voice/selection';
import { getVoiceProvider } from '@/lib/voice/registry';
import { attachTwilioMediaBridge } from '@/lib/voice/ai/twilio-media-bridge';
import { callSessionRepository } from '@/lib/db/repository/voice';
import { createSTTClient, type STTProviderId } from '@/lib/voice/ai/stt/index';
import { createTTSClient, type TTSProviderId } from '@/lib/voice/ai/tts/index';

// ── Config ────────────────────────────────────────────────────────────────
const CONCURRENCY = Math.max(1, Number(process.env.VOICE_WORKER_CONCURRENCY || 5));
const LOAD_THRESHOLD = Number(process.env.VOICE_WORKER_LOAD_THRESHOLD || DEFAULT_LOAD_THRESHOLD);
/** How long to defer a job when this worker is over its load threshold. */
const LOAD_DEFER_MS = Number(process.env.VOICE_WORKER_DEFER_MS || 5_000);
/** How long to wait for the provider's media WS to connect after admission. */
const MEDIA_CONNECT_TIMEOUT_MS = Number(process.env.VOICE_MEDIA_CONNECT_TIMEOUT_MS || 30_000);
/** Drain timeout — wait this long for active sessions before exit. */
export const DRAIN_TIMEOUT_MS = Number(process.env.VOICE_WORKER_DRAIN_MS || 30_000);
/** Media WS server port for this worker. */
const MEDIA_WS_PORT = parseInt(process.env.VOICE_WS_PORT ?? '3001', 10);

const STT_DEFAULT = (process.env.VOICE_STT_PROVIDER ?? 'deepgram') as STTProviderId;
const TTS_DEFAULT = (process.env.VOICE_TTS_PROVIDER ?? 'openai') as TTSProviderId;
const LLM_MODEL = process.env.VOICE_LLM_MODEL ?? 'gpt-4o-mini';
const LLM_SYSTEM_PROMPT_DEFAULT =
  process.env.VOICE_LLM_SYSTEM_PROMPT ??
  'You are MontrAI’s voice assistant. Speak naturally and keep answers short for telephony.';

const PATH_RE = /^\/api\/v2\/voice\/media-stream\/([a-f0-9]{24})$/i;

// ── Worker-local state ──────────────────────────────────────────────────────
const WORKER_ID = `voice-${os.hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let cachedWorker: Worker<CallJob, CallJobResult> | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let mediaServer: http.Server | null = null;
let mediaWss: WebSocketServer | null = null;
let draining = false;

/** Active sessions on THIS worker (the load denominator's numerator). */
let activeSessions = 0;

/**
 * Jobs admitted + awaiting their media socket. Keyed by callSessionId so the WS
 * upgrade handler can hand the socket to the right parked job.
 */
const pendingMedia = new Map<string, (ws: WebSocket) => void>();

export interface CallJobResult {
  callSessionId: string;
  status: 'completed' | 'failed' | 'deferred' | 'no-bridge';
  error?: string;
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
function currentLoad() {
  return computeLoad({ activeSessions, maxSessions: CONCURRENCY });
}

async function doHeartbeat(): Promise<void> {
  const { load } = currentLoad();
  await heartbeat(WORKER_ID, { load, activeSessions, maxSessions: CONCURRENCY }).catch(() => { /* best-effort */ });
  // Opportunistic reaping — cheap HDEL sweep of crashed peers. Idempotent, so
  // having every worker do it is fine for a small fleet.
  await reapDeadWorkers(WORKER_TTL_MS).catch(() => { /* best-effort */ });
}

// ── Media WS server (per-call Twilio Media Stream sockets) ──────────────────
function startMediaServer(): void {
  if (mediaServer) return;
  mediaServer = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      const { load, sessionLoad, cpuLoad } = currentLoad();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          workerId: WORKER_ID,
          load,
          sessionLoad,
          cpuLoad,
          activeSessions,
          maxSessions: CONCURRENCY,
          draining,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  mediaWss = new WebSocketServer({ noServer: true });

  mediaServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const match = url.match(PATH_RE);
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const callSessionId = match[1];
    const handoff = pendingMedia.get(callSessionId);
    if (!handoff) {
      // No job on this worker is waiting for this session's media. Could be a
      // late reconnect or a socket that landed on the wrong worker. Reject so
      // the provider/LB can retry against the right worker.
      socket.write('HTTP/1.1 409 Conflict\r\n\r\n');
      socket.destroy();
      return;
    }
    mediaWss!.handleUpgrade(req, socket, head, (ws) => {
      pendingMedia.delete(callSessionId);
      handoff(ws);
    });
  });

  mediaServer.listen(MEDIA_WS_PORT, () => {
    console.log(`[voice-call-worker] media WS listening on :${MEDIA_WS_PORT} (worker ${WORKER_ID})`);
  });
}

// ── Per-call bridge build (reuses ws-handler hydration + media bridge) ──────
/**
 * Build the conversation engine + Twilio media bridge for an admitted call.
 * This mirrors `server/ws-handler.ts#handleConnection` (session/bot/character
 * hydration) and then delegates to the EXISTING `attachTwilioMediaBridge`.
 * Returns a promise that resolves when the call ends (socket close/stop).
 */
async function runMediaStreamCall(job: CallJob, ws: WebSocket): Promise<void> {
  const { callSessionId, organizationId } = job;

  const session = await callSessionRepository.findById(callSessionId);
  if (!session) {
    console.warn(`[voice-call-worker] unknown call_session ${callSessionId} for org ${organizationId}`);
    try { ws.close(); } catch { /* ignore */ }
    return;
  }

  // Per-call hints: prefer the dispatched sessionMeta, fall back to the
  // persisted customMetadata (parity with ws-handler).
  const meta: Record<string, unknown> = {
    ...((session.customMetadata as Record<string, unknown> | undefined) ?? {}),
    ...(job.sessionMeta ?? {}),
  };

  const aiBotId = typeof meta.aiBotId === 'string' ? meta.aiBotId : undefined;
  let bot: import('@/lib/db/models/ai-bot.model').IAiBot | null = null;
  if (aiBotId) {
    try {
      const { aiBotRepository } = await import('@/lib/db/repository/ai-bot.repository');
      bot = await aiBotRepository.findActiveById(aiBotId, 'voice');
    } catch (err) {
      console.warn('[voice-call-worker] AiBot load failed:', err);
    }
  }

  const aiCharacterId =
    bot?.aiCharacterId?.toString() ??
    (typeof meta.aiCharacterId === 'string' ? meta.aiCharacterId : undefined);

  let character: import('@/lib/db/models/ai-character.model').IAiCharacter | null = null;
  if (aiCharacterId) {
    try {
      const { default: AiCharacter } = await import('@/lib/db/models/ai-character.model');
      character = await AiCharacter.findOne({
        _id: aiCharacterId
      }).exec();
    } catch (err) {
      console.warn('[voice-call-worker] AiCharacter load failed:', err);
    }
  }

  const characterLanguage = character?.voice?.language ?? 'en-US';
  const characterTtsProvider = (character?.voice?.provider as TTSProviderId | undefined) ?? TTS_DEFAULT;
  const characterVoiceId = character?.voice?.voiceId;

  const stt = createSTTClient({ provider: STT_DEFAULT, language: characterLanguage });
  const tts = createTTSClient({
    provider: characterTtsProvider,
    language: characterLanguage,
    voice: characterVoiceId,
  });

  const promptParts: string[] = [];
  const explicitScript = typeof meta.script === 'string' ? meta.script : undefined;
  if (explicitScript) promptParts.push(explicitScript);
  else if (bot?.systemPrompt) promptParts.push(bot.systemPrompt);
  else promptParts.push(LLM_SYSTEM_PROMPT_DEFAULT);
  if (character?.personality) promptParts.push(`Personality: ${character.personality}`);
  if (character?.styleDescriptors && character.styleDescriptors.length > 0) {
    promptParts.push(`Style: ${character.styleDescriptors.join(', ')}`);
  }
  const systemPrompt = promptParts.join('\n\n');
  const llmModel = bot?.llmModel ?? LLM_MODEL;

  // KB/RAG + in-call tools (B3) — parity with ws-handler. KB ids come from the
  // hydrated bot (🔒 org-scoped, never the caller); CRM lookup always available.
  const knowledgeBaseIds = bot?.knowledgeBaseIds?.map((id) => id.toString()) ?? [];
  const { buildVoiceTools } = await import('@/lib/voice/ai/tools');
  const voiceTools = buildVoiceTools({ knowledgeBaseIds });

  // Reuse the existing bridge — DO NOT rewrite media handling.
  const turnMode = (process.env.VOICE_TURN_DETECTION ?? 'vad') as
    | 'energy'
    | 'vad'
    | 'semantic';

  const { close } = attachTwilioMediaBridge(ws, {
    conversation: {
      callSessionId,
      // The dispatch job carries the engine mode (cascaded vs realtime S2S).
      engine: job.engine,
      agent: {
        model: llmModel,
        systemPrompt,
        tools: voiceTools,
        knowledgeBaseIds,
        brandId: bot?.brandId ? bot.brandId.toString() : null,
      },
      stt,
      tts,
      language: characterLanguage,
      audioEncoding: 'mulaw',
      sampleRate: 8000,
      turnDetection: {
        mode: turnMode,
        minSilenceMs: 480,
        maxSilenceMs: 1600,
        interruptMinMs: 280,
        falseInterruptionTimeoutMs: 900,
      },
    },
  });

  if (bot) {
    try {
      const { aiBotRepository } = await import('@/lib/db/repository/ai-bot.repository');
      void aiBotRepository.incrementUsage(String(bot._id));
    } catch { /* best-effort */ }
  }

  if (!session.answeredAt) {
    await callSessionRepository.updateStatus(callSessionId, {
      status: 'answered',
      answeredAt: new Date(),
    }).catch(() => { /* best-effort */ });
  }

  // Resolve when the call's media socket closes — that's call-end for this leg.
  await new Promise<void>((resolve) => {
    ws.on('close', () => resolve());
    ws.on('error', () => resolve());
  });
  // Ensure engine teardown ran (bridge also closes on stop/close).
  await close().catch(() => { /* best-effort */ });
}

// ── Job processing ──────────────────────────────────────────────────────────
async function processJob(job: Job<CallJob>, token?: string): Promise<CallJobResult> {
  const payload = job.data;

  // 1) Load-aware admission. If this worker is over threshold, push the job
  //    back so a less-loaded worker takes it — exactly like the workflow worker
  //    defers on a per-org cap.
  const { load } = currentLoad();
  if (draining || !isAvailable(load, LOAD_THRESHOLD)) {
    if (token) {
      await job.moveToDelayed(Date.now() + LOAD_DEFER_MS, token);
      throw new DelayedError(); // BullMQ: intentional delay, not a failure
    }
    // No token (shouldn't happen) → fall through and run (fail-open).
  }

  // 2) Claim a session slot on this worker.
  activeSessions += 1;
  await doHeartbeat().catch(() => { /* best-effort */ });

  console.log(
    `[voice-call-worker] Admitting call ${payload.callSessionId} ` +
      `(org=${payload.organizationId} provider=${payload.providerId} engine=${payload.engine} dir=${payload.direction}) ` +
      `active=${activeSessions}/${CONCURRENCY}`,
  );

  try {
    // 3) Resolve provider + credential (org-scoped). We don't call SDKs — we
    //    only need the provider's transport kind to decide how to bridge.
    const initiatorId =
      typeof payload.sessionMeta?.userId === 'string' ? payload.sessionMeta.userId : payload.organizationId;
    const selection = await getProviderForCall({
      userId: initiatorId,
      brandId: payload.brandId ?? null,
      preferredProviderId: payload.providerId,
    });
    const provider = selection?.provider ?? getVoiceProvider(payload.providerId);
    if (!provider) {
      console.error(`[voice-call-worker] no provider impl for ${payload.providerId} (call ${payload.callSessionId})`);
      return { callSessionId: payload.callSessionId, status: 'no-bridge', error: 'provider-unavailable' };
    }

    const transport = provider.capabilities.transportKind;

    if (transport === 'media_stream') {
      // 4a) Park the job until the provider's per-call media WS connects, then
      //     run the bridge until the call ends.
      const ws = await waitForMediaSocket(payload.callSessionId);
      if (!ws) {
        return {
          callSessionId: payload.callSessionId,
          status: 'failed',
          error: `media socket did not connect within ${MEDIA_CONNECT_TIMEOUT_MS}ms`,
        };
      }
      await runMediaStreamCall(payload, ws);
      return { callSessionId: payload.callSessionId, status: 'completed' };
    }

    // 4b) call_control transport — REST-driven, media bridged out-of-band.
    // TODO Phase 8: call-control media attach (Telnyx Call Control / Asterisk
    // ARI). Establish the media leg via the provider's call-control API and
    // pump it through the conversation engine. For now this is a no-op stub so
    // the worker doesn't crash on a call_control provider.
    console.warn(
      `[voice-call-worker] call_control transport not yet implemented (provider ${payload.providerId}, call ${payload.callSessionId})`,
    );
    return { callSessionId: payload.callSessionId, status: 'no-bridge', error: 'call_control-not-implemented' };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[voice-call-worker] call ${payload.callSessionId} failed:`, errMsg);
    return { callSessionId: payload.callSessionId, status: 'failed', error: errMsg };
  } finally {
    // 5) Release: session slot + registry + org admission slot.
    activeSessions = Math.max(0, activeSessions - 1);
    pendingMedia.delete(payload.callSessionId);
    await releaseOrgCallSlot(payload.organizationId).catch(() => { /* best-effort */ });
    await doHeartbeat().catch(() => { /* best-effort */ });
  }
}

/** Park until the provider's media socket connects, or time out → null. */
function waitForMediaSocket(callSessionId: string): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingMedia.delete(callSessionId);
      resolve(null);
    }, MEDIA_CONNECT_TIMEOUT_MS);

    pendingMedia.set(callSessionId, (ws) => {
      clearTimeout(timer);
      resolve(ws);
    });
  });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
/**
 * Create + start the voice-call worker. Idempotent (returns the cached
 * instance). Returns null when Redis isn't configured. Boots the media WS
 * server, registers the worker in the fleet registry, and starts heartbeating.
 */
export function startCallWorker(): Worker<CallJob, CallJobResult> | null {
  if (cachedWorker) return cachedWorker;
  const connection = getRedisConnection();
  if (!connection) {
    console.warn('[voice-call-worker] Redis not configured — worker will not start.');
    return null;
  }

  startMediaServer();

  // Register + begin heartbeating before pulling jobs so dispatch sees us.
  void registerWorker(WORKER_ID, {
    host: os.hostname(),
    pid: process.pid,
    maxSessions: CONCURRENCY,
  });
  heartbeatTimer = setInterval(() => { void doHeartbeat(); }, WORKER_HEARTBEAT_MS);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

  cachedWorker = new Worker<CallJob, CallJobResult>(
    VOICE_CALL_QUEUE_NAME,
    processJob,
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: CONCURRENCY,
      autorun: true,
    },
  );

  cachedWorker.on('ready', () => {
    console.log(`[voice-call-worker] Ready — id=${WORKER_ID} concurrency=${CONCURRENCY} threshold=${LOAD_THRESHOLD}`);
  });
  cachedWorker.on('completed', (j, result) => {
    console.log(`[voice-call-worker] Completed ${j.id} — call=${result.callSessionId} status=${result.status}`);
  });
  cachedWorker.on('failed', (j, err) => {
    console.error(`[voice-call-worker] Job ${j?.id} errored:`, err?.message || err);
  });
  cachedWorker.on('error', (err) => {
    console.error('[voice-call-worker] Worker error:', err?.message || err);
  });

  return cachedWorker;
}

/**
 * Graceful drain (LiveKit `drain_timeout` analog). Marks the worker draining so
 * dispatch stops targeting it + new jobs self-defer, stops accepting new jobs,
 * then waits up to `DRAIN_TIMEOUT_MS` for active sessions to finish before
 * tearing everything down.
 */
export async function stopCallWorker(): Promise<void> {
  draining = true;
  await markDraining(WORKER_ID).catch(() => { /* best-effort */ });

  // Wait for active sessions to drain (calls end on their own as parties hang
  // up). Poll cheaply until they hit zero or the drain deadline passes.
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (activeSessions > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (activeSessions > 0) {
    console.warn(`[voice-call-worker] drain timeout — ${activeSessions} session(s) still active, forcing shutdown.`);
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (cachedWorker) {
    await cachedWorker.close().catch(() => { /* best-effort */ });
    cachedWorker = null;
  }

  await deregisterWorker(WORKER_ID).catch(() => { /* best-effort */ });

  if (mediaServer) {
    await new Promise<void>((resolve) => mediaServer!.close(() => resolve()));
    mediaServer = null;
    mediaWss = null;
  }
}

/** This worker's stable id (exposed for the entrypoint's /healthz + logs). */
export function getWorkerId(): string {
  return WORKER_ID;
}

/** Current load snapshot (exposed for the entrypoint's /healthz). */
export function getWorkerStatus() {
  const { load, sessionLoad, cpuLoad } = currentLoad();
  return { workerId: WORKER_ID, load, sessionLoad, cpuLoad, activeSessions, maxSessions: CONCURRENCY, draining };
}
