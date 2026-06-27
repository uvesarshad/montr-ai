import { describe, it, expect } from 'vitest';

import { getBand, formatBandsForPrompt, BENCHMARK_BANDS } from './benchmarks';

describe('benchmarks · getBand', () => {
  it('returns the band for a known metric', () => {
    const band = getBand('emailOpenRate');
    expect(band).toBeDefined();
    expect(band?.min).toBe(8);
    expect(band?.max).toBe(45);
    expect(band?.unit).toBe('percent');
  });

  it('returns undefined for an unknown metric', () => {
    expect(getBand('totallyMadeUp')).toBeUndefined();
  });

  it('ignores forward-compat opts and returns the base band', () => {
    expect(getBand('postsPerWeek', { channel: 'instagram', industry: 'ecom' })).toEqual(
      BENCHMARK_BANDS.postsPerWeek,
    );
  });
});

describe('benchmarks · formatBandsForPrompt', () => {
  it('prefers channel-relevant bands when channels are passed', () => {
    const text = formatBandsForPrompt(['email']);
    expect(text).toContain('Realistic ranges');
    expect(text).toContain('Email open rate');
    expect(text).toContain('8–45%');
  });

  it('renders perWeek bands with a /week suffix', () => {
    const text = formatBandsForPrompt(['whatsapp']);
    expect(text).toContain('WhatsApp broadcasts/week 1–5/week');
  });

  it('falls back to core bands with no channels', () => {
    const text = formatBandsForPrompt();
    expect(text).toContain('Realistic ranges');
    expect(text.length).toBeGreaterThan(20);
  });
});
