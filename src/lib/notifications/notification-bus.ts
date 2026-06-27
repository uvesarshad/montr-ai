/**
 * Cross-process notification socket bridge.
 *
 * Mirrors `src/lib/workflow/events/bus.ts`: notifications can be created in the
 * HTTP process (API routes) or the BullMQ worker (scheduled tasks, credit
 * consumption during a queued AI run). Either way they must reach the browser,
 * and only the HTTP/Socket.IO process owns the live connections.
 *
 * `publishNotificationEvent` pushes onto a Redis channel; `subscribeNotificationEvents(io)`
 * (called once at server boot) re-emits each event into the recipient's
 * `user:<userId>` room.
 *
 * Single-emit guarantee: when Redis is configured we ONLY publish to Redis and
 * let the subscriber emit (the publishing process is also subscribed, so a
 * local fan-out here would double-deliver). When Redis is absent (single-process
 * dev), we emit directly to `global.io`.
 */

import type { Server as SocketIOServer } from 'socket.io';
import { getRedisConnection } from '@/lib/workflow/queue/connection';

export const NOTIFICATION_EVENTS_CHANNEL = 'montrai:notifications';

export interface NotificationSocketPayload {
    userId: string;
    /** Full notification document (lean) for `notification:new`. */
    notification?: Record<string, unknown>;
    /** Fresh unread count for the recipient. */
    unreadCount?: number;
    publishedAt?: number;
}

function userRoom(userId: string): string {
    return `user:${userId}`;
}

function getLocalIO(): SocketIOServer | null {
    return (global as unknown as { io?: SocketIOServer }).io || null;
}

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
    publisher.on('error', (err: Error) => console.error('[notifications] publisher error:', err.message));
    publisherReady = true;
    return publisher;
}

function emitToUser(io: SocketIOServer, payload: NotificationSocketPayload) {
    if (!payload.userId) return;
    const room = userRoom(payload.userId);
    if (payload.notification) {
        io.to(room).emit('notification:new', payload.notification);
    }
    if (typeof payload.unreadCount === 'number') {
        io.to(room).emit('notification:unread-count', { count: payload.unreadCount });
    }
}

/**
 * Publish a notification socket event. Fire-and-forget; errors are logged.
 */
export async function publishNotificationEvent(payload: NotificationSocketPayload): Promise<void> {
    const envelope: NotificationSocketPayload = { ...payload, publishedAt: Date.now() };

    const pub = getPublisher();
    if (pub) {
        // Redis present — publish only. The subscriber (this or another process)
        // performs the single socket emit.
        try {
            await pub.publish(NOTIFICATION_EVENTS_CHANNEL, JSON.stringify(envelope));
        } catch (err: unknown) {
            console.error('[notifications] publish failed:', err instanceof Error ? err.message : err);
        }
        return;
    }

    // No Redis — single-process dev. Emit directly.
    const io = getLocalIO();
    if (io) {
        try {
            emitToUser(io, envelope);
        } catch (err: unknown) {
            console.error('[notifications] local emit failed:', err instanceof Error ? err.message : err);
        }
    }
}

export function publishNotificationEventAsync(payload: NotificationSocketPayload): void {
    publishNotificationEvent(payload).catch((err) =>
        console.error('[notifications] async publish error:', err?.message || err)
    );
}

let subscriberReady = false;
/**
 * Subscribe to the cross-process notification stream and forward to user rooms.
 * Idempotent. Call once at Socket.IO server boot.
 */
export function subscribeNotificationEvents(io: SocketIOServer): void {
    if (subscriberReady) return;

    const base = getRedisConnection();
    if (!base) {
        console.warn('[notifications] Redis not configured — cross-process notifications disabled (local emit only).');
        subscriberReady = true;
        return;
    }

    const sub = base.duplicate();
    sub.on('error', (err: Error) => console.error('[notifications] subscriber error:', err.message));

    sub.subscribe(NOTIFICATION_EVENTS_CHANNEL, (err) => {
        if (err) {
            console.error('[notifications] subscribe failed:', err.message);
            return;
        }
        console.log(`[notifications] Subscribed to ${NOTIFICATION_EVENTS_CHANNEL}`);
    });

    sub.on('message', (channel: string, raw: string) => {
        if (channel !== NOTIFICATION_EVENTS_CHANNEL) return;
        let envelope: NotificationSocketPayload;
        try {
            envelope = JSON.parse(raw);
        } catch {
            return;
        }
        try {
            emitToUser(io, envelope);
        } catch (err: unknown) {
            console.error('[notifications] room emit failed:', err instanceof Error ? err.message : err);
        }
    });

    subscriberReady = true;
}
