/**
 * Semantic turn-taking — Phase 3.
 *
 * A `TurnDetector` decides whether the *user's* turn is over given the
 * transcript so far and how long they've been silent. This is what lets the
 * agent reply at a natural beat instead of either interrupting mid-sentence or
 * waiting an awkwardly long fixed timeout.
 *
 * Two implementations:
 *  - `HeuristicTurnDetector` — pure punctuation/grammar + silence rules. No
 *    model, fully deterministic, good default.
 *  - `SemanticTurnDetector` — an end-of-utterance (EOU) ONNX model ADAPTER with
 *    the same guard-and-fallback pattern as `SileroVad`: if the runtime/model
 *    isn't available it delegates to the heuristic detector. No fake inference.
 *
 * `DynamicEndpointing` adapts the silence window between min/max based on the
 * conversation's recent rhythm (EMA), so a fast back-and-forth gets a snappier
 * endpoint than a slow, thoughtful exchange.
 */

import type { VoiceTurnDetectionConfig } from '../../types';
import { getEouSession, type EouMessage } from './eou-session';

/** Context passed to a turn detector for each decision. */
export interface TurnContext {
  /** Everything the user has said this turn (interim + final transcript). */
  transcriptSoFar: string;
  /** Trailing silence observed since the last speech, in milliseconds. */
  silenceMs: number;
  /** Effective turn-detection config for this call. */
  config: VoiceTurnDetectionConfig;
  /**
   * Recent conversation turns (excluding the in-progress user turn) — used by
   * the semantic EOU model for context. Optional; the heuristic ignores it.
   */
  history?: EouMessage[];
}

/** Decides when a user's turn has ended. */
export interface TurnDetector {
  /** True when the user's turn should be considered complete. */
  shouldEndTurn(ctx: TurnContext): boolean | Promise<boolean>;
  /** Reset any per-turn state. */
  reset(): void;
}

const DEFAULT_MIN_SILENCE_MS = 500;
const DEFAULT_MAX_SILENCE_MS = 1500;

/** Trailing sentence-final punctuation. */
const SENTENCE_FINAL_RE = /[.!?。！？]\s*$/;
/** Trailing characters that strongly imply the speaker is NOT done. */
const CONTINUATION_RE = /[,;:\-—]\s*$/;
/**
 * Trailing function words that usually precede more speech ("I want to ...",
 * "because ...", "and ..."). If the utterance ends on one, wait longer.
 */
const TRAILING_FILLER_RE =
  /\b(and|but|or|so|because|the|a|an|to|of|for|with|that|i|we|my|your|um|uh)\s*$/i;

/**
 * Heuristic turn detector.
 *
 * Rules (first match wins):
 *  1. Long silence ≥ maxSilenceMs  → end turn (the user clearly stopped).
 *  2. Silence < minSilenceMs       → not yet (still mid-pause).
 *  3. Trailing continuation/filler  → keep waiting (they're mid-thought).
 *  4. Sentence-final punctuation + ≥ minSilenceMs → end turn.
 *  5. Otherwise end once silence reaches the dynamic window.
 */
export class HeuristicTurnDetector implements TurnDetector {
  private readonly endpointing?: DynamicEndpointing;

  constructor(opts: { endpointing?: DynamicEndpointing } = {}) {
    this.endpointing = opts.endpointing;
  }

  shouldEndTurn(ctx: TurnContext): boolean {
    const minSilence = ctx.config.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS;
    const maxSilence = ctx.config.maxSilenceMs ?? DEFAULT_MAX_SILENCE_MS;
    const text = ctx.transcriptSoFar.trim();

    // 1. Hard cap — regardless of grammar, this much silence ends the turn.
    if (ctx.silenceMs >= maxSilence) return true;

    // 2. Haven't waited the minimum yet.
    if (ctx.silenceMs < minSilence) return false;

    // Empty/near-empty transcript: rely purely on silence windows.
    if (!text) {
      const window = this.endpointing?.currentWindowMs() ?? minSilence;
      return ctx.silenceMs >= window;
    }

    // 3. Obvious mid-thought trailing tokens → keep listening.
    if (CONTINUATION_RE.test(text) || TRAILING_FILLER_RE.test(text)) {
      return false;
    }

    // 4. Completed sentence + minimum silence → end now.
    if (SENTENCE_FINAL_RE.test(text)) return true;

    // 5. No punctuation cue — end once we've reached the (possibly adaptive)
    //    silence window.
    const window = this.endpointing?.currentWindowMs() ?? minSilence;
    return ctx.silenceMs >= window;
  }

  reset(): void {
    this.endpointing?.reset();
  }
}

/**
 * Semantic (EOU model) turn detector — ADAPTER.
 *
 * Loads an end-of-utterance classifier (e.g. a small transformer exported to
 * ONNX, like LiveKit's turn-detector or a fine-tuned model). It scores the
 * transcript for "is the speaker finished?" and combines that with the silence
 * window. Per-language thresholds let us tune sensitivity by locale.
 *
 * Backed by the shared `EouSession` (LiveKit `livekit/turn-detector` ONNX model
 * + HF tokenizer). The model loads once per process in the background; until it
 * is ready — or if its 65 MB weights can't be fetched — this detector runs the
 * heuristic instead, never fake inference. A turn ends early when the EOU score
 * clears the per-language threshold; otherwise the silence window decides.
 */
export interface SemanticTurnDetectorConfig {
  /** Unused (the shared EouSession owns the model path); kept for compatibility. */
  modelPath?: string;
  /** Default EOU probability threshold to treat the turn as complete. */
  threshold?: number;
  /**
   * Per-language threshold overrides (BCP-47-ish prefix → threshold). Some
   * languages signal completion differently; scaffold so we can tune later.
   */
  languageThresholds?: Record<string, number>;
  /** Language of the call, used to pick a threshold. */
  language?: string;
  endpointing?: DynamicEndpointing;
}

let semanticWarned = false;

export class SemanticTurnDetector implements TurnDetector {
  private readonly fallback: HeuristicTurnDetector;
  private readonly config: SemanticTurnDetectorConfig;
  private readonly session = getEouSession();

  constructor(config: SemanticTurnDetectorConfig = {}) {
    this.config = config;
    this.fallback = new HeuristicTurnDetector({ endpointing: config.endpointing });
    // Kick off the (shared, idempotent) model load in the background. Until it's
    // ready, shouldEndTurn() runs the heuristic — never fake inference.
    void this.session.load().then((ok) => {
      if (!ok && !semanticWarned) {
        semanticWarned = true;
        console.warn('[turn] EOU model not loaded — semantic detector using heuristic.');
      }
    });
  }

  /** EOU threshold for the active language (model's tuned value; config can override). */
  private thresholdForLanguage(): number {
    if (this.config.threshold !== undefined) return this.config.threshold;
    const lang = (this.config.language ?? 'en').toLowerCase();
    const fromConfig = this.config.languageThresholds?.[lang.split('-')[0]];
    if (fromConfig !== undefined) return fromConfig;
    // languages.json (en ≈ 0.0289). The model's "complete" predictions clear
    // this low bar; everything else falls through to the silence window.
    return this.session.thresholdFor(lang) ?? 0.0289;
  }

  async shouldEndTurn(ctx: TurnContext): Promise<boolean> {
    const maxSilence = ctx.config.maxSilenceMs ?? DEFAULT_MAX_SILENCE_MS;
    const minSilence = ctx.config.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS;

    // Hard caps short-circuit before any inference.
    if (ctx.silenceMs >= maxSilence) return true;
    if (ctx.silenceMs < minSilence) return false;

    if (!this.session.isReady()) {
      // No model yet → honest heuristic fallback.
      return this.fallback.shouldEndTurn(ctx);
    }

    const messages: EouMessage[] = [
      ...(ctx.history ?? []),
      { role: 'user', content: ctx.transcriptSoFar },
    ];
    const score = await this.session.predictEou(messages);
    if (score === null) return this.fallback.shouldEndTurn(ctx);

    // Model says the turn looks complete → end early; otherwise keep waiting
    // (the maxSilence cap above guarantees we still end eventually).
    return score >= this.thresholdForLanguage();
  }

  reset(): void {
    this.fallback.reset();
  }

  /** True once the shared EOU session is loaded. */
  isModelReady(): boolean {
    return this.session.isReady();
  }
}

/**
 * Dynamic endpointing helper.
 *
 * Tracks an exponential moving average (EMA) of recent observed turn-end
 * silence durations and exposes a clamped silence window in
 * [minSilenceMs, maxSilenceMs]. Feed it each turn's actual end-silence via
 * `observe()`; read the adapted window via `currentWindowMs()`.
 */
export class DynamicEndpointing {
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly alpha: number;
  private ema: number;

  constructor(opts: {
    minSilenceMs?: number;
    maxSilenceMs?: number;
    /** EMA smoothing factor (0..1); higher = adapts faster. */
    alpha?: number;
  } = {}) {
    this.minMs = opts.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS;
    this.maxMs = opts.maxSilenceMs ?? DEFAULT_MAX_SILENCE_MS;
    this.alpha = opts.alpha ?? 0.3;
    // Seed at the midpoint so early turns aren't biased to either extreme.
    this.ema = (this.minMs + this.maxMs) / 2;
  }

  /** Record the silence (ms) that actually preceded a completed turn. */
  observe(silenceMs: number): void {
    const clamped = Math.max(this.minMs, Math.min(this.maxMs, silenceMs));
    this.ema = this.alpha * clamped + (1 - this.alpha) * this.ema;
  }

  /** Current adapted silence window, clamped to [min, max]. */
  currentWindowMs(): number {
    return Math.max(this.minMs, Math.min(this.maxMs, Math.round(this.ema)));
  }

  reset(): void {
    this.ema = (this.minMs + this.maxMs) / 2;
  }
}

/**
 * Factory: build a turn detector from the call's turn-detection config.
 *
 * `mode: 'semantic'` → attempt the EOU model adapter (auto-falls-back).
 * `mode: 'vad' | 'energy'` (or unset) → heuristic detector.
 *
 * A `DynamicEndpointing` is always attached so silence windows adapt regardless
 * of detector type.
 */
export function createTurnDetector(
  config: VoiceTurnDetectionConfig & {
    language?: string;
    modelPath?: string;
    languageThresholds?: Record<string, number>;
  },
): TurnDetector {
  const endpointing = new DynamicEndpointing({
    minSilenceMs: config.minSilenceMs,
    maxSilenceMs: config.maxSilenceMs,
  });

  if (config.mode === 'semantic') {
    return new SemanticTurnDetector({
      modelPath: config.modelPath,
      language: config.language,
      languageThresholds: config.languageThresholds,
      endpointing,
    });
  }

  return new HeuristicTurnDetector({ endpointing });
}
