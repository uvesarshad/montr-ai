import { describe, it, expect } from 'vitest';

import { validateStrategy, type ValidateContext } from './validate';
import type { CanonicalChannel } from './connected-channels';

const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

function ctxWith(channels: CanonicalChannel[], userGoal = 'grow monthly orders'): ValidateContext {
  return { connectedChannels: new Set<CanonicalChannel>(channels), userGoal };
}

/** A strategy that should pass every check against email+instagram+whatsapp. */
const validStrategy = {
  name: 'Q3 Orders Growth',
  description: 'Grow monthly orders through email and instagram.',
  goals: [{ kpi: 'Monthly orders', target: '500', deadline: future }],
  channels: ['email', 'instagram'],
  contentMix: { video: 40, image: 30, text: 30 },
  cadence: { postsPerWeek: 5, emailsPerWeek: 2, callsPerWeek: 0, whatsappPerWeek: 0 },
};

const errors = (parsed: unknown, ctx: ValidateContext) =>
  validateStrategy(parsed, ctx).issues.filter((i) => i.severity === 'error');

describe('validateStrategy · happy path', () => {
  it('passes a sound, fully-grounded strategy', () => {
    const result = validateStrategy(validStrategy, ctxWith(['email', 'instagram', 'whatsapp']));
    expect(result.issues).toHaveLength(0);
    expect(result.status).toBe('passed');
  });
});

describe('validateStrategy · C2 channel grounding', () => {
  it('flags a channel the brand has not connected', () => {
    const bad = { ...validStrategy, channels: ['email', 'linkedin'] };
    const result = validateStrategy(bad, ctxWith(['email', 'instagram']));
    expect(result.status).toBe('failed');
    expect(result.issues.some((i) => i.id === 'C2.channel')).toBe(true);
  });

  it('emits a single warn (not error flood) when no channels are connected', () => {
    const result = validateStrategy(validStrategy, ctxWith([]));
    expect(result.issues.some((i) => i.id === 'C2.channel')).toBe(false);
    expect(result.issues.some((i) => i.id === 'C2.unprovisioned' && i.severity === 'warn')).toBe(true);
    expect(result.status).toBe('passed_with_warnings');
  });
});

describe('validateStrategy · C5 internal consistency', () => {
  it('rejects a contentMix that does not sum to ~100', () => {
    const bad = { ...validStrategy, contentMix: { video: 50, image: 50, text: 30 } };
    const result = errors(bad, ctxWith(['email', 'instagram']));
    expect(result.some((i) => i.id === 'C5.contentMix')).toBe(true);
  });
});

describe('validateStrategy · C4 numeric sanity', () => {
  it('flags a goal target implying an out-of-band conversion rate', () => {
    const bad = {
      ...validStrategy,
      goals: [{ kpi: 'Email to order conversion', target: '40%', deadline: future }],
    };
    const result = errors(bad, ctxWith(['email', 'instagram']));
    expect(result.some((i) => i.id === 'C4.target')).toBe(true);
  });
});

describe('validateStrategy · C3 goal measurability', () => {
  it('flags a vague KPI and a non-numeric target', () => {
    const bad = {
      ...validStrategy,
      goals: [{ kpi: 'engagement', target: 'more', deadline: future }],
    };
    const result = errors(bad, ctxWith(['email', 'instagram']));
    expect(result.some((i) => i.id === 'C3.kpi')).toBe(true);
    expect(result.some((i) => i.id === 'C3.target')).toBe(true);
  });

  it('flags a past deadline', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const bad = {
      ...validStrategy,
      goals: [{ kpi: 'Monthly orders', target: '500', deadline: past }],
    };
    const result = errors(bad, ctxWith(['email', 'instagram']));
    expect(result.some((i) => i.id === 'C3.deadline')).toBe(true);
  });
});

describe('validateStrategy · C1 schema completeness', () => {
  it('flags missing required fields without throwing', () => {
    const result = validateStrategy({ name: '', goals: [], channels: [] }, ctxWith(['email']));
    expect(result.status).toBe('failed');
    expect(result.issues.some((i) => i.id.startsWith('C1'))).toBe(true);
  });

  it('never throws on garbage input', () => {
    expect(() => validateStrategy(null, ctxWith([]))).not.toThrow();
    expect(() => validateStrategy(42, ctxWith([]))).not.toThrow();
  });
});
