/**
 * Voice event broadcasting.
 *
 * Bridges normalized `VoiceEvent` records to Socket.io rooms. Clients listening
 * on `voice:call:<callSessionId>` get every event for that call.
 *
 * Cross-process delivery: the standalone voice-ws-server process publishes to
 * Redis channel `voice:events`; the main Next.js HTTP process subscribes and
 * re-emits to its local Socket.io. Falls back to in-process `global.io` when
 * Redis isn't configured.
 */

import type { Server as SocketIOServer } from 'socket.io';

import type { VoiceEvent } from './types';
import { getRedisConnection } from '@/lib/workflow/queue/connection';

export const VOICE_EVENTS_CHANNEL = 'voice:events';

interface VoiceEventEnvelope {
  callSessionId: string;
  event: VoiceEvent;
  at: string;
}

function getLocalIO(): SocketIOServer | null {
  return (global as unknown as { io?: SocketIOServer }).io ?? null;
}

let publisher: ReturnType<NonNullable<ReturnType<typeof getRedisConnection>>['duplicate']> | null = null;
let publisherReady = false;

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
    console.error('[voice-events] publisher error:', err.message);
  });
  publisherReady = true;
  return publisher;
}

export function broadcastVoiceEvent(
  callSessionId: string,
  event: VoiceEvent,
): void {
  const envelope: VoiceEventEnvelope = {
    callSessionId,
    event,
    at: new Date().toISOString(),
  };

  // 1) Local fan-out (only fires when broadcaster is in the HTTP process).
  const io = getLocalIO();
  if (io) {
    io.to(`voice:call:${callSessionId}`).emit('voice:event', envelope);
  }

  // 2) Redis pub/sub for cross-process delivery (voice-ws-server → HTTP).
  const pub = getPublisher();
  if (pub) {
    pub.publish(VOICE_EVENTS_CHANNEL, JSON.stringify(envelope)).catch((err) => {
      console.error('[voice-events] publish failed:', err);
    });
  }
}

/**
 * Subscribe to cross-process voice events and re-emit to the local Socket.io.
 * Called once from the main HTTP server boot path.
 */
export function subscribeVoiceEvents(io: SocketIOServer): { close: () => Promise<void> } | null {
  const base = getRedisConnection();
  if (!base) return null;

  const sub = base.duplicate();
  sub.on('error', (err: Error) => {
    console.error('[voice-events] subscriber error:', err.message);
  });

  void sub.subscribe(VOICE_EVENTS_CHANNEL);
  sub.on('message', (channel: string, raw: string) => {
    if (channel !== VOICE_EVENTS_CHANNEL) return;
    let envelope: VoiceEventEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }
    io.to(`voice:call:${envelope.callSessionId}`).emit('voice:event', envelope);
  });

  return {
    async close() {
      try {
        await sub.unsubscribe(VOICE_EVENTS_CHANNEL);
        await sub.quit();
      } catch {
        // Ignore — process is exiting.
      }
    },
  };
}
