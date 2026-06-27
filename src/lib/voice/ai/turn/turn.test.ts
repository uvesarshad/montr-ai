/**
 * Turn-detector unit tests.
 *
 * Pure/deterministic coverage: EOU text normalization, the heuristic detector's
 * rules, dynamic endpointing, and the semantic detector's model-independent
 * short-circuits (hard silence caps). Real EOU inference is verified out-of-band
 * (it needs the 65 MB model + tokenizer); here we only assert the behavior that
 * must hold regardless of whether the model is loaded.
 */
import { describe, it, expect } from 'vitest';
import {
  HeuristicTurnDetector,
  SemanticTurnDetector,
  DynamicEndpointing,
  type TurnContext,
} from './index';
import { normalizeEouText } from './eou-session';
import type { VoiceTurnDetectionConfig } from '../../types';

const cfg: VoiceTurnDetectionConfig = { mode: 'semantic', minSilenceMs: 400, maxSilenceMs: 1500 };
const ctx = (over: Partial<TurnContext>): TurnContext => ({
  transcriptSoFar: '',
  silenceMs: 0,
  config: cfg,
  ...over,
});

describe('normalizeEouText', () => {
  it('lowercases, strips punctuation (keeps apostrophe/hyphen), collapses spaces', () => {
    expect(normalizeEouText('Hi, how can I help you today?')).toBe('hi how can i help you today');
    expect(normalizeEouText("I'm a well-trained assistant!")).toBe("i'm a well-trained assistant");
    expect(normalizeEouText('Price: $19.99  (20% off).')).toBe('price 1999 20 off');
    expect(normalizeEouText('')).toBe('');
  });
});

describe('HeuristicTurnDetector', () => {
  const det = new HeuristicTurnDetector();
  it('ends on long silence regardless of text', () => {
    expect(det.shouldEndTurn(ctx({ transcriptSoFar: 'i was thinking that', silenceMs: 2000 }))).toBe(true);
  });
  it('waits below minimum silence', () => {
    expect(det.shouldEndTurn(ctx({ transcriptSoFar: 'done.', silenceMs: 100 }))).toBe(false);
  });
  it('keeps waiting on a trailing filler/continuation word', () => {
    expect(det.shouldEndTurn(ctx({ transcriptSoFar: 'i need to check my account and', silenceMs: 600 }))).toBe(false);
  });
  it('ends on a completed sentence past minimum silence', () => {
    expect(det.shouldEndTurn(ctx({ transcriptSoFar: 'that works for me.', silenceMs: 600 }))).toBe(true);
  });
});

describe('DynamicEndpointing', () => {
  it('clamps the adapted window to [min, max]', () => {
    const ep = new DynamicEndpointing({ minSilenceMs: 300, maxSilenceMs: 1200 });
    ep.observe(100); // below min
    expect(ep.currentWindowMs()).toBeGreaterThanOrEqual(300);
    ep.observe(5000); // above max
    expect(ep.currentWindowMs()).toBeLessThanOrEqual(1200);
  });
});

describe('SemanticTurnDetector model-independent behavior', () => {
  // These short-circuit before any inference, so they're deterministic whether
  // or not the EOU model is present in the test environment.
  const det = new SemanticTurnDetector({ language: 'en' });

  it('ends immediately at/after the hard silence cap', async () => {
    await expect(
      det.shouldEndTurn(ctx({ transcriptSoFar: 'maybe we could', silenceMs: 1500 })),
    ).resolves.toBe(true);
  });

  it('waits below the minimum silence', async () => {
    await expect(
      det.shouldEndTurn(ctx({ transcriptSoFar: 'all set.', silenceMs: 100 })),
    ).resolves.toBe(false);
  });
});
