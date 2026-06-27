/**
 * Smoke tests for the engine's `ExecutionPausedForEvent` primitive.
 *
 * Pure unit-level: exercises the Error class and its `spec` field. The
 * full pause→resume round trip is covered by integration tests against a
 * running engine + Mongo.
 */

import { describe, it, expect } from 'vitest';
import { ExecutionPausedForEvent } from './execution-pause-signals';

describe('ExecutionPausedForEvent', () => {
  it('carries the wait node id, next nodes, and subscription spec', () => {
    const err = new ExecutionPausedForEvent('wait_1', ['next_a', 'next_b'], {
      kind: 'call_completed',
      key: 'contact_42',
      timeoutMs: 60_000,
    });
    expect(err.waitNodeId).toBe('wait_1');
    expect(err.nextNodeIds).toEqual(['next_a', 'next_b']);
    expect(err.spec.kind).toBe('call_completed');
    expect(err.spec.key).toBe('contact_42');
    expect(err.spec.timeoutMs).toBe(60_000);
  });

  it('is an Error instance the engine catch can branch on', () => {
    const err = new ExecutionPausedForEvent('w', [], { kind: 'k' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ExecutionPausedForEvent');
    expect(err.message).toContain('paused for event');
    expect(err.message).toContain('w');
    expect(err.message).toContain('k');
  });

  it('accepts an optional payload for provider-specific data', () => {
    const err = new ExecutionPausedForEvent('w', [], {
      kind: 'social_event',
      key: 'thread_99',
      payload: { platform: 'instagram', eventType: 'dm' },
    });
    expect(err.spec.payload).toMatchObject({ platform: 'instagram' });
  });
});
