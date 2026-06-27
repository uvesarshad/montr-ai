/**
 * Cross-process workflow event bus (P-8).
 *
 * The BullMQ worker runs in a separate Node process from the Next.js HTTP
 * server, so `global.io` in the engine only ever fires inside the HTTP
 * process. Workflow runs happening on the worker would emit into the void,
 * and connected browsers would see nothing.
 *
 * This module bridges that gap via a Redis pub/sub channel:
 *   - `publishWorkflowEvent(event)` — called from the engine wherever it
 *     wants to notify clients. Publishes to Redis AND fans out to the
 *     local Socket.IO instance when one is available (so same-process runs
 *     still work when Redis is not configured).
 *   - `subscribeWorkflowEvents(io)` — called once from the Socket.IO server
 *     on boot. Subscribes to the Redis channel and re-emits each incoming
 *     event into the matching `workflow:<id>` / `execution:<id>` room.
 *
 * The wire shape is a plain JSON envelope:
 *   { type, workflowId, executionId?, payload, publishedAt }
 * Event names match the existing socket event names the client already
 * listens for (`execution:started`, `execution:step`, …) — keep them stable.
 */

import type { Server as SocketIOServer } from 'socket.io';
import { getRedisConnection } from '../queue/connection';

export const WORKFLOW_EVENTS_CHANNEL = 'workflow:events';

export type WorkflowEventType =
  | 'execution:started'
  | 'execution:step'
  | 'execution:completed'
  | 'execution:failed'
  | 'execution:paused'
  | 'execution:resumed'
  | 'execution:status';

export interface WorkflowEventEnvelope {
  type: WorkflowEventType;
  workflowId: string;
  executionId?: string;
  payload: Record<string, unknown>;
  publishedAt: number;
  /** Source tag — lets consumers dedupe if they ever re-ingest their own events. */
  source?: string;
}

/** Lazily created IORedis client dedicated to publishing. BullMQ's connection
 *  runs in subscribe-safe mode so we can't reuse it directly for publish calls
 *  from a subscriber process, but a plain duplicate() is fine. */
let publisherReady = false;
let publisher: ReturnType<NonNullable<ReturnType<typeof getRedisConnection>>['duplicate']> | null = null;

function getPublisher() {
  if (publisherReady) return publisher;
  const base = getRedisConnection();
  if (!base) {
    publisherReady = true;
    publisher = null;
    return null;
  }
  publisher = base.duplicate();
  publisher.on('error', (err: Error) => {
    console.error('[workflow-events] publisher error:', err.message);
  });
  publisherReady = true;
  return publisher;
}

/** Same-process Socket.IO pointer — set by the HTTP server so the engine can
 *  emit locally without a pub/sub round-trip when it happens to be in-process. */
function getLocalIO(): SocketIOServer | null {
  return (global as unknown as { io?: SocketIOServer }).io || null;
}

/**
 * Emit a workflow event. Delivers to connected sockets both directly (if
 * running in the same process as Socket.IO) and via Redis pub/sub (so
 * worker-side runs reach the HTTP process that owns the Socket.IO server).
 *
 * Callers should not `await` on this for correctness; the return promise
 * exists so tests can sync on it.
 */
export async function publishWorkflowEvent(event: Omit<WorkflowEventEnvelope, 'publishedAt'>): Promise<void> {
  const envelope: WorkflowEventEnvelope = {
    ...event,
    publishedAt: Date.now(),
  };

  // 1) Local fan-out (HTTP process only — worker has no `global.io`).
  const io = getLocalIO();
  if (io) {
    try {
      emitToRooms(io, envelope);
    } catch (err: unknown) {
      console.error('[workflow-events] local emit failed:', err instanceof Error ? err.message : err);
    }
  }

  // 2) Pub/sub fan-out so the HTTP process picks up events from the worker.
  const pub = getPublisher();
  if (pub) {
    try {
      await pub.publish(WORKFLOW_EVENTS_CHANNEL, JSON.stringify(envelope));
    } catch (err: unknown) {
      console.error('[workflow-events] publish failed:', err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Non-awaiting version for hot paths (engine emit methods) where we don't want
 * to add Promise overhead per node step. Fire-and-forget; errors still log.
 */
export function publishWorkflowEventAsync(event: Omit<WorkflowEventEnvelope, 'publishedAt'>): void {
  publishWorkflowEvent(event).catch((err) => {
    console.error('[workflow-events] async publish error:', err?.message || err);
  });
}

/**
 * Subscribe to the cross-process event stream and forward to Socket.IO rooms.
 * Call this once at Socket.IO server startup. Idempotent — repeat calls are
 * no-ops after the first successful subscribe.
 */
let subscriberReady = false;
export function subscribeWorkflowEvents(io: SocketIOServer): void {
  if (subscriberReady) return;

  const base = getRedisConnection();
  if (!base) {
    // Redis not configured — same-process `global.io` fan-out is all we have.
    // The engine still emits locally via publishWorkflowEvent(), so nothing
    // breaks. This is the dev-only path.
    console.warn('[workflow-events] Redis not configured — cross-process events disabled.');
    subscriberReady = true;
    return;
  }

  const sub = base.duplicate();
  sub.on('error', (err: Error) => {
    console.error('[workflow-events] subscriber error:', err.message);
  });

  sub.subscribe(WORKFLOW_EVENTS_CHANNEL, (err) => {
    if (err) {
      console.error('[workflow-events] subscribe failed:', err.message);
      return;
    }
    console.log(`[workflow-events] Subscribed to ${WORKFLOW_EVENTS_CHANNEL}`);
  });

  sub.on('message', (channel: string, raw: string) => {
    if (channel !== WORKFLOW_EVENTS_CHANNEL) return;
    let envelope: WorkflowEventEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      emitToRooms(io, envelope);
    } catch (err: unknown) {
      console.error('[workflow-events] room emit failed:', err instanceof Error ? err.message : err);
    }
  });

  subscriberReady = true;
}

function emitToRooms(io: SocketIOServer, env: WorkflowEventEnvelope) {
  // Workflow-scoped room — anyone watching this workflow in the editor.
  if (env.workflowId) {
    io.to(`workflow:${env.workflowId}`).emit(env.type, {
      workflowId: env.workflowId,
      executionId: env.executionId,
      ...env.payload,
    });
  }
  // Execution-scoped room — execution detail panels watching a single run.
  if (env.executionId) {
    io.to(`execution:${env.executionId}`).emit(env.type, {
      workflowId: env.workflowId,
      executionId: env.executionId,
      ...env.payload,
    });
  }
}
