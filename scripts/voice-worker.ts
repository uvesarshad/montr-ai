/**
 * Voice call worker entrypoint.
 *
 * Run as a separate process from the Next.js server. Boots Mongo + the voice
 * subsystem + the BullMQ `voice-call` worker (the load-aware media tier), then
 * holds the process open until a shutdown signal arrives. Scale OUT by running
 * more of these — each registers itself in the shared worker registry and pulls
 * jobs from the same queue. Use:
 *
 *   npx tsx scripts/voice-worker.ts
 *
 * Environment:
 *   - MongoDB: whatever MONGODB_URI / MONGO_URL your app already uses
 *   - Redis:   REDIS_URL (or REDIS_HOST + REDIS_PORT + REDIS_PASSWORD)  ← REQUIRED
 *   - VOICE_WORKER_CONCURRENCY: max concurrent live sessions (default 5)
 *   - VOICE_WORKER_LOAD_THRESHOLD: shed-work load threshold 0..1 (default 0.7)
 *   - VOICE_WORKER_DRAIN_MS: graceful-drain wait on shutdown (default 30000)
 *   - VOICE_WS_PORT: per-call media WS server port (default 3001)
 *   - VOICE_WORKER_HEALTH_PORT: /healthz port (default 3002)
 *
 * ⚠ Known gotcha (workers need REDIS_URL or they exit): this process exits
 * LOUDLY with code 1 if Redis isn't configured — a voice worker with no queue
 * has nothing to do, and silently staying up hides a misconfig.
 */

import 'dotenv/config';
import http from 'http';

import { dbConnect } from '../src/lib/db/connect';
import { initVoiceSubsystem } from '../src/lib/voice/bootstrap';
import {
  startCallWorker,
  stopCallWorker,
  getWorkerId,
  getWorkerStatus,
} from '../src/lib/voice/dispatch';
import {
  startCampaignWorker,
  stopCampaignWorker,
  resumePendingCampaigns,
} from '../src/lib/voice/campaign';

const HEALTH_PORT = parseInt(process.env.VOICE_WORKER_HEALTH_PORT ?? '3002', 10);

function startHealthServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/') {
      const status = getWorkerStatus();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`[voice-worker] health endpoint on :${HEALTH_PORT}/healthz`);
  });
  return server;
}

async function main(): Promise<void> {
  console.log('[voice-worker] Booting…');
  await dbConnect();
  console.log('[voice-worker] Mongo connected.');

  // Wire the provider config lookup + register provider impls before any call
  // resolves a provider/credential.
  initVoiceSubsystem();
  console.log('[voice-worker] Voice subsystem initialized.');

  const worker = startCallWorker();
  if (!worker) {
    // Known gotcha: voice workers need Redis or they exit. Be loud.
    console.error('[voice-worker] Redis not configured — cannot start call worker. Exiting.');
    process.exit(1);
  }

  // Campaign/bulk-dialing tier: durable BullMQ orchestrator (rate-limited +
  // circuit-broken) replaces the legacy in-memory setTimeout dispatcher.
  const campaignWorker = startCampaignWorker();
  if (campaignWorker) {
    try {
      await resumePendingCampaigns();
      console.log('[voice-worker] Campaign worker online + pending campaigns resumed.');
    } catch (err) {
      console.error('[voice-worker] Campaign resume failed:', err);
    }
  }

  const healthServer = startHealthServer();
  console.log(`[voice-worker] Worker ${getWorkerId()} online.`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[voice-worker] ${signal} received — draining…`);
    try {
      // Graceful drain: stop accepting new jobs, wait out active sessions up to
      // VOICE_WORKER_DRAIN_MS, then tear down.
      await stopCampaignWorker();
      await stopCallWorker();
      await new Promise<void>((resolve) => healthServer.close(() => resolve()));
      console.log('[voice-worker] Drained + stopped. Goodbye.');
      process.exit(0);
    } catch (err) {
      console.error('[voice-worker] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[voice-worker] Fatal boot error:', err);
  process.exit(1);
});
