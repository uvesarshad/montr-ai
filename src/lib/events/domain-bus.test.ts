/**
 * Domain event bus tests. No Redis — exercises the in-process EventEmitter
 * path (which is the fallback when Redis isn't configured).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  publishDomainEvent,
  subscribeDomainEvent,
  subscribeAllDomainEvents,
  DomainEventEnvelope,
} from './domain-bus';

describe('domain-bus', () => {
  it('delivers events to typed subscribers', async () => {
    const handler = vi.fn();
    const unsub = subscribeDomainEvent('ai_studio.generation_completed', handler);
    publishDomainEvent({
      type: 'ai_studio.generation_completed',
      organizationId: 'org_1',
      brandId: 'brand_1',
      source: 'test',
      payload: { projectId: 'p1', sessionId: 's1' },
    });
    // Local emit is sync — handler fires immediately.
    expect(handler).toHaveBeenCalledTimes(1);
    const envelope = handler.mock.calls[0][0] as DomainEventEnvelope;
    expect(envelope.type).toBe('ai_studio.generation_completed');
    expect(envelope.organizationId).toBe('org_1');
    expect(envelope.payload).toMatchObject({ projectId: 'p1' });
    expect(envelope.publishedAt).toEqual(expect.any(Number));
    unsub();
  });

  it('only delivers to subscribers of the matching type', () => {
    const aHandler = vi.fn();
    const bHandler = vi.fn();
    const unsubA = subscribeDomainEvent('post.published', aHandler);
    const unsubB = subscribeDomainEvent('post.approved', bHandler);

    publishDomainEvent({
      type: 'post.published',
      organizationId: 'org_2',
      source: 'test',
      payload: { postId: 'x' },
    });

    expect(aHandler).toHaveBeenCalledTimes(1);
    expect(bHandler).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });

  it('catch-all subscriber sees every event', () => {
    const all = vi.fn();
    const unsub = subscribeAllDomainEvents(all);
    publishDomainEvent({
      type: 'workflow.execution_started',
      organizationId: 'org_3',
      source: 'test',
      payload: {},
    });
    publishDomainEvent({
      type: 'workflow.execution_completed',
      organizationId: 'org_3',
      source: 'test',
      payload: {},
    });
    expect(all).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('unsubscribe stops further deliveries', () => {
    const handler = vi.fn();
    const unsub = subscribeDomainEvent('post.published', handler);
    unsub();
    publishDomainEvent({
      type: 'post.published',
      organizationId: 'org_4',
      source: 'test',
      payload: {},
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
