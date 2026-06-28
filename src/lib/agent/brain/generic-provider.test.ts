/**
 * GenericBrainProvider — the core brain must return the existing generic
 * defaults (a faithful, no-regression wrap of the pre-seam behaviour), and the
 * binding seam must default to generic while letting an overlay swap in.
 *
 * Pure unit test: only the deterministic, DB-free surfaces are exercised
 * (addenda, grounding bands, resolution/binding). Model + playbook lookups
 * delegate to DB-backed services and are covered by integration paths.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { GenericBrainProvider } from './generic-provider';
import { resolveBrainProvider, bindBrainProvider, type BrainProvider } from './provider';
import { formatBandsForPrompt } from '@/lib/strategy/benchmarks';

const ctx = { userId: 'u1', organizationId: 'o1', brandId: 'b1' };

describe('GenericBrainProvider (core defaults)', () => {
  const brain = new GenericBrainProvider();

  it('identifies as the generic core brain', () => {
    expect(brain.id).toBe('generic');
  });

  it('adds no premium system-prompt addenda (core)', async () => {
    await expect(brain.getSystemPromptAddenda(ctx)).resolves.toBe('');
  });

  it('grounding bands equal the static formatBandsForPrompt output', () => {
    // No channels → core cadence/rate bands.
    expect(brain.getGroundingBands({})).toBe(formatBandsForPrompt(undefined));
    // Channel-specific → same channel-relevant bands as before the seam.
    expect(brain.getGroundingBands({ channels: ['email', 'whatsapp'] })).toBe(
      formatBandsForPrompt(['email', 'whatsapp']),
    );
  });
});

describe('brain provider binding/resolution', () => {
  afterEach(() => {
    bindBrainProvider(null); // reset to the generic default between cases.
  });

  it('resolves the generic provider by default', () => {
    expect(resolveBrainProvider().id).toBe('generic');
  });

  it('returns a stable (cached) generic instance', () => {
    expect(resolveBrainProvider()).toBe(resolveBrainProvider());
  });

  it('lets an overlay bind a curated provider, then reset to generic', () => {
    const curated: BrainProvider = {
      id: 'curated-test',
      getSystemPromptAddenda: async () => 'PREMIUM ADDENDA',
      getPlaybooks: async () => 'curated playbooks',
      getGroundingBands: () => 'curated bands',
      getPreferredModel: async () => ({ modelId: 'tuned-model', source: 'system' }),
    };

    const active = bindBrainProvider(curated);
    expect(active.id).toBe('curated-test');
    expect(resolveBrainProvider().id).toBe('curated-test');

    bindBrainProvider(null);
    expect(resolveBrainProvider().id).toBe('generic');
  });
});
