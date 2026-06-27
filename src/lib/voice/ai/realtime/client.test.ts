/**
 * Realtime client unit tests.
 *
 * The bidirectional audio socket itself needs live QA against OpenAI, but the
 * key-resolution precedence is pure + must never regress (it's what lets the
 * bridge fall back from realtime → cascaded when no key is present).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveRealtimeApiKey } from './client';

const ENV_KEYS = ['VOICE_REALTIME_API_KEY', 'OPENAI_API_KEY'] as const;

describe('resolveRealtimeApiKey', () => {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('prefers the explicit (BYOK) key over env', () => {
    process.env.VOICE_REALTIME_API_KEY = 'env-rt';
    process.env.OPENAI_API_KEY = 'env-oai';
    expect(resolveRealtimeApiKey('byok')).toBe('byok');
  });

  it('falls back to VOICE_REALTIME_API_KEY, then OPENAI_API_KEY', () => {
    delete process.env.VOICE_REALTIME_API_KEY;
    process.env.OPENAI_API_KEY = 'env-oai';
    expect(resolveRealtimeApiKey()).toBe('env-oai');

    process.env.VOICE_REALTIME_API_KEY = 'env-rt';
    expect(resolveRealtimeApiKey()).toBe('env-rt');
  });

  it('returns null when nothing is configured (→ bridge uses cascaded)', () => {
    delete process.env.VOICE_REALTIME_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(resolveRealtimeApiKey()).toBeNull();
    expect(resolveRealtimeApiKey(undefined)).toBeNull();
  });
});
