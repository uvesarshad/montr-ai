/**
 * Agent mission runner worker entrypoint.
 *
 * Run as a separate process from the Next.js server. Drives autonomous missions
 * through repeated turns until they reach a terminal state, get HITL-blocked,
 * exhaust their budget, or stall.
 *
 *   npx tsx scripts/agent-mission-runner-worker.ts
 *
 * Environment:
 *   - MongoDB: MONGODB_URI / MONGO_URL
 *   - Redis:   REDIS_URL (or REDIS_HOST + REDIS_PORT + REDIS_PASSWORD)
 */

import 'dotenv/config';
import { dbConnect } from '../src/lib/db/connect';
import { createAgentMissionRunnerWorker } from '../src/lib/queue/worker';

async function main() {
  console.log('[agent-mission-runner] Booting…');
  await dbConnect();
  console.log('[agent-mission-runner] Mongo connected.');

  const worker = createAgentMissionRunnerWorker();

  const shutdown = async (signal: string) => {
    console.log(`[agent-mission-runner] ${signal} received — shutting down…`);
    try {
      await worker.close();
      console.log('[agent-mission-runner] Worker stopped. Goodbye.');
      process.exit(0);
    } catch (err) {
      console.error('[agent-mission-runner] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[agent-mission-runner] Fatal boot error:', err);
  process.exit(1);
});
