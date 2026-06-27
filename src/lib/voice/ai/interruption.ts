/**
 * Adaptive interruption controller — Phase 3.
 *
 * Decides when the *caller* genuinely intends to interrupt the agent's TTS, as
 * opposed to a cough, a "mm-hmm" backchannel, or line noise. It wraps a
 * `VadDetector` and only fires `onInterrupt()` once the caller has produced
 * sustained speech beyond `interruptMinMs` (and, optionally, enough words via
 * an STT-fed word gate).
 *
 * It also models LiveKit's `resume_false_interruption`: when an interruption is
 * fired the agent pauses its speech, but if the caller falls quiet again within
 * `falseInterruptionTimeoutMs` WITHOUT a real turn being committed, the
 * controller fires `onResume()` so the agent can pick its sentence back up
 * instead of awkwardly restarting.
 *
 * Pure and timer-injectable for deterministic unit tests.
 */

import type { VadDetector } from './vad';

export interface AdaptiveInterruptionConfig {
  /** Minimum sustained caller speech to count as a real interruption (ms). */
  interruptMinMs?: number;
  /**
   * Minimum words (from STT) before an interruption is allowed. 0 disables the
   * word gate (speech-duration alone decides).
   */
  interruptMinWords?: number;
  /**
   * If the caller goes quiet again within this window after an interruption
   * (and no real turn was committed), fire `onResume()`. 0 disables resume.
   */
  falseInterruptionTimeoutMs?: number;
}

export interface AdaptiveInterruptionCallbacks {
  /** Fired once when a real interruption is detected — cut the agent's TTS. */
  onInterrupt: () => void;
  /**
   * Fired when a suspected interruption turned out to be false (caller went
   * quiet without committing a turn) — the agent may resume its TTS.
   */
  onResume?: () => void;
}

/** Injectable timer surface so tests can drive the false-interruption clock. */
export interface InterruptionTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
}

const realTimers: InterruptionTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export class AdaptiveInterruptionController {
  private readonly vad: VadDetector;
  private readonly interruptMinMs: number;
  private readonly interruptMinWords: number;
  private readonly falseInterruptionTimeoutMs: number;
  private readonly callbacks: AdaptiveInterruptionCallbacks;
  private readonly timers: InterruptionTimers;

  /** Accumulated continuous caller speech in the current onset (ms). */
  private speechRunMs = 0;
  /** Words reported by STT during the current onset. */
  private wordsThisOnset = 0;
  /** Whether we've already fired onInterrupt for the current onset. */
  private interruptFired = false;
  /** Pending false-interruption resume timer handle. */
  private resumeTimer: unknown = null;
  /** Set true once a real turn is committed, suppressing resume. */
  private turnCommitted = false;

  constructor(
    vad: VadDetector,
    config: AdaptiveInterruptionConfig,
    callbacks: AdaptiveInterruptionCallbacks,
    timers: InterruptionTimers = realTimers,
  ) {
    this.vad = vad;
    this.interruptMinMs = config.interruptMinMs ?? 250;
    this.interruptMinWords = config.interruptMinWords ?? 0;
    this.falseInterruptionTimeoutMs = config.falseInterruptionTimeoutMs ?? 0;
    this.callbacks = callbacks;
    this.timers = timers;
  }

  /**
   * Feed a caller audio chunk. Drives the VAD; fires `onInterrupt` when the
   * sustained-speech (and optional word) gates are crossed.
   */
  ingest(chunk: Uint8Array): void {
    const event = this.vad.ingest(chunk);
    if (!event) {
      // No transition this frame — but if the VAD now reports silence after an
      // interruption, arm the false-interruption resume window.
      if (this.interruptFired && !this.vad.isSpeaking()) {
        this.armResumeWindow();
      }
      return;
    }

    if (event.type === 'speech-start') {
      // New caller speech onset. Cancel any pending resume — the caller is back.
      this.cancelResumeWindow();
      this.maybeFireInterrupt(event.speechMs);
    } else if (event.type === 'inference') {
      // Per-frame signal while speaking — keep checking the duration gate.
      if (this.vad.isSpeaking()) {
        this.maybeFireInterrupt(event.speechMs);
      }
    } else if (event.type === 'speech-end') {
      // Caller stopped. If we'd fired an interruption but no turn committed,
      // this is a candidate false interruption → arm the resume window.
      if (this.interruptFired) {
        this.armResumeWindow();
      } else {
        this.resetOnset();
      }
    }
  }

  /** Feed an STT word count for the current caller onset (word gate). */
  noteWords(n: number): void {
    if (n <= 0) return;
    this.wordsThisOnset += n;
    // A late-arriving word count may now satisfy the word gate.
    if (!this.interruptFired) {
      this.maybeFireInterrupt(this.speechRunMs);
    }
  }

  /**
   * Mark that a real user turn was committed (turn detector said the turn
   * ended). This suppresses any pending false-interruption resume.
   */
  commitTurn(): void {
    this.turnCommitted = true;
    this.cancelResumeWindow();
  }

  private maybeFireInterrupt(speechMs: number): void {
    this.speechRunMs = Math.max(this.speechRunMs, speechMs);
    if (this.interruptFired) return;

    const durationOk = this.speechRunMs >= this.interruptMinMs;
    const wordsOk =
      this.interruptMinWords <= 0 || this.wordsThisOnset >= this.interruptMinWords;

    if (durationOk && wordsOk) {
      this.interruptFired = true;
      this.turnCommitted = false;
      try {
        this.callbacks.onInterrupt();
      } catch (err) {
        console.error('[interruption] onInterrupt threw:', err);
      }
    }
  }

  private armResumeWindow(): void {
    if (this.falseInterruptionTimeoutMs <= 0) return;
    if (this.resumeTimer !== null) return; // already armed
    if (this.turnCommitted) return; // a real turn happened — never resume

    this.resumeTimer = this.timers.setTimeout(() => {
      this.resumeTimer = null;
      // Only resume if no real turn committed and the caller is still quiet.
      if (!this.turnCommitted && !this.vad.isSpeaking()) {
        try {
          this.callbacks.onResume?.();
        } catch (err) {
          console.error('[interruption] onResume threw:', err);
        }
        // The agent resumes; clear the interruption so the next onset is fresh.
        this.resetOnset();
      }
    }, this.falseInterruptionTimeoutMs);
  }

  private cancelResumeWindow(): void {
    if (this.resumeTimer !== null) {
      this.timers.clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  private resetOnset(): void {
    this.speechRunMs = 0;
    this.wordsThisOnset = 0;
    this.interruptFired = false;
    this.turnCommitted = false;
  }

  /** Reset all state (call between turns/calls). */
  reset(): void {
    this.cancelResumeWindow();
    this.resetOnset();
    this.vad.reset();
  }
}
