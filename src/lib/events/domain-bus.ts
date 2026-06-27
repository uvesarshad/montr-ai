/**
 * Domain event bus (X3).
 *
 * Cross-cutting events that downstream consumers (audit logs, webhooks,
 * workflow triggers, analytics dashboards) subscribe to without each side
 * knowing about the other.
 *
 * Goes through Redis pub/sub when configured (so workers see events emitted
 * from the HTTP process and vice versa), with an in-memory fallback for
 * single-process dev runs.
 *
 * This bus is **separate** from `src/lib/workflow/events/bus.ts`. That one is
 * specifically Socket.IO room fan-out for live execution UIs. This one is
 * generic — subscribers can be anything from a Mongo write to a HTTP webhook.
 *
 * Producers:
 *   - AI Studio orchestration `completeSession` → `ai_studio.generation_completed`
 *   - Social publish path → `post.published`
 *   - Post-approval submission → `post.approval_requested`
 *   - Workflow execution completed → `workflow.execution_completed`
 *   - (Bundle 3) voice call ended → `voice.call_completed`
 */

import { EventEmitter } from 'events';
import { getRedisConnection } from '@/lib/workflow/queue/connection';
import type Redis from 'ioredis';

export const DOMAIN_EVENTS_CHANNEL = 'montrai:domain-events';

export type DomainEventType =
  | 'post.published'
  | 'post.approval_requested'
  | 'post.approved'
  | 'post.rejected'
  | 'ai_studio.generation_started'
  | 'ai_studio.generation_completed'
  | 'ai_studio.generation_failed'
  | 'workflow.execution_started'
  | 'workflow.execution_completed'
  | 'workflow.execution_failed'
  | 'voice.call_inbound'
  | 'voice.call_initiated'
  | 'voice.call_answered'
  | 'voice.call_completed'
  | 'voice.call_failed'
  | 'voice.recording_available'
  | 'social.interaction_recorded'
  | 'ai_bot.conversation_ended'
  | 'ai_bot.escalation_requested'
  // Bundle 3 — identity / channel ingest producers (B3-5.1)
  | 'contact.created'
  | 'contact.merged'
  | 'form.submitted'
  | 'message.received'
  // Phase 2 (2026-06-05) — inbound channel events for agent mission triggers
  | 'whatsapp.message_received'
  | 'ads.lead_captured'
  | 'meeting.booked'
  // Integrations — Notion doc sync
  | 'docs.notion_sync_failed'
  // Integrations — inbound provider webhooks
  | 'shopify.webhook_received'
  | 'revenuecat.webhook_received'
  | 'mailchimp.webhook_received'
  | 'calendly.webhook_received'
  | 'stripe.webhook_received'
  // Integrations — connection lifecycle
  | 'integration.connection_expired'
  // Ads — lead capture + weekly digest
  | 'ads.lead_sync_failed'
  | 'ads.weekly_summary';

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  type: DomainEventType;
  organizationId?: string;
  brandId?: string;
  /** Free-form payload — shape varies per event type. */
  payload: T;
  /** Producer that emitted the event. Useful for dedup / debugging. */
  source: string;
  publishedAt: number;
}

const localBus = new EventEmitter();
// Listeners are usually a single subscriber per event type, but allow a small
// headroom for tests/multi-handlers. Node defaults to 10 — keep that.
localBus.setMaxListeners(50);

let publisher: Redis | null = null;
let publisherReady = false;
function getPublisher(): Redis | null {
  if (publisherReady) return publisher;
  const base = getRedisConnection();
  if (!base) {
    publisherReady = true;
    return null;
  }
  publisher = base.duplicate();
  publisher.on('error', err => console.error('[domain-events] publisher error:', err.message));
  publisherReady = true;
  return publisher;
}

let subscriber: Redis | null = null;
function ensureSubscriber(): void {
  if (subscriber) return;
  const base = getRedisConnection();
  if (!base) return; // single-process mode — local bus handles everything
  subscriber = base.duplicate();
  subscriber.on('error', err => console.error('[domain-events] subscriber error:', err.message));
  subscriber.subscribe(DOMAIN_EVENTS_CHANNEL, err => {
    if (err) console.error('[domain-events] subscribe failed:', err.message);
  });
  subscriber.on('message', (channel: string, raw: string) => {
    if (channel !== DOMAIN_EVENTS_CHANNEL) return;
    try {
      const envelope = JSON.parse(raw) as DomainEventEnvelope;
      localBus.emit(envelope.type, envelope);
      localBus.emit('*', envelope);
    } catch (err) {
      console.error('[domain-events] message parse error:', err);
    }
  });
}

/**
 * Publish a domain event. Hits the local bus immediately (so same-process
 * subscribers see it without a Redis round trip), then fans out via Redis.
 *
 * Fire-and-forget — callers don't need to await. Errors are logged.
 */
export function publishDomainEvent<T extends Record<string, unknown>>(
  event: Omit<DomainEventEnvelope<T>, 'publishedAt'>
): void {
  const envelope: DomainEventEnvelope<T> = { ...event, publishedAt: Date.now() };

  // Local fan-out first — lets in-process subscribers act before the Redis hop.
  try {
    localBus.emit(envelope.type, envelope);
    localBus.emit('*', envelope);
  } catch (err) {
    console.error('[domain-events] local emit failed:', err);
  }

  // Cross-process fan-out via Redis.
  const pub = getPublisher();
  if (!pub) return;
  pub.publish(DOMAIN_EVENTS_CHANNEL, JSON.stringify(envelope)).catch(err =>
    console.error('[domain-events] publish failed:', err?.message ?? err)
  );
}

/**
 * Subscribe to a single event type. Returns an unsubscribe function.
 */
export function subscribeDomainEvent<T extends Record<string, unknown> = Record<string, unknown>>(
  type: DomainEventType,
  handler: (envelope: DomainEventEnvelope<T>) => void | Promise<void>
): () => void {
  ensureSubscriber();
  const wrapped = (envelope: DomainEventEnvelope) => {
    void Promise.resolve(handler(envelope as DomainEventEnvelope<T>)).catch(err =>
      console.error(`[domain-events] handler for ${type} failed:`, err?.message ?? err)
    );
  };
  localBus.on(type, wrapped);
  return () => localBus.off(type, wrapped);
}

/**
 * Subscribe to all events. Useful for audit-log writers.
 */
export function subscribeAllDomainEvents(
  handler: (envelope: DomainEventEnvelope) => void | Promise<void>
): () => void {
  ensureSubscriber();
  const wrapped = (envelope: DomainEventEnvelope) => {
    void Promise.resolve(handler(envelope)).catch(err =>
      console.error('[domain-events] catch-all handler failed:', err?.message ?? err)
    );
  };
  localBus.on('*', wrapped);
  return () => localBus.off('*', wrapped);
}
