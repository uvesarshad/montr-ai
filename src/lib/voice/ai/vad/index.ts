/**
 * Voice Activity Detection (VAD) — Phase 3.
 *
 * A `VadDetector` consumes raw μ-law / PCM audio frames (the same byte stream
 * the STT client and the legacy barge-in detector see) and emits coarse
 * speech-start / speech-end events plus optional per-frame inference signals.
 *
 * Two implementations ship:
 *  - `EnergyVad` — a cleaner energy-based detector. Improves on `barge-in.ts`
 *    by adding configurable speech/silence thresholds and *hangover* frames so
 *    a brief dip mid-word doesn't prematurely end speech.
 *  - `SileroVad` — an ONNX Silero VAD ADAPTER. `onnxruntime-node` is not a
 *    dependency yet, so the model load is guarded and falls back to `EnergyVad`.
 *    The shape is final: dropping in the dep + model asset later "just works".
 *
 * The energy detector is pure and synchronous; the Silero detector runs real
 * ONNX inference off the hot path (see `SileroVad`) and degrades to the energy
 * detector when the optional native runtime/model isn't present.
 */

import { SileroSession } from './silero-session';

/** μ-law → linear PCM16 decode table (shared decode approach with barge-in.ts). */
const MULAW_DECODE_TABLE = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const muVal = ~i & 0xff;
    const sign = muVal & 0x80;
    const exponent = (muVal >> 4) & 0x07;
    const mantissa = muVal & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    table[i] = sign ? -sample : sample;
  }
  return table;
})();

export type VadEncoding = 'mulaw' | 'pcm16';

/** Kinds of events a VAD emits. */
export type VadEventType = 'speech-start' | 'speech-end' | 'inference';

/** A single VAD event. */
export interface VadEvent {
  type: VadEventType;
  /**
   * Model/heuristic speech probability for the frame that produced this event
   * (0..1). For the energy detector this is a normalized RMS proxy.
   */
  probability: number;
  /** Accumulated continuous speech duration so far in the current utterance (ms). */
  speechMs: number;
  /** Accumulated continuous silence duration since speech ended (ms). */
  silenceMs: number;
}

/** Common VAD configuration. */
export interface VadConfig {
  encoding?: VadEncoding;
  sampleRate?: number;
  /** Probability (0..1) at/above which a frame is "speech". */
  speechThreshold?: number;
  /** Probability (0..1) at/below which a frame is "silence". */
  silenceThreshold?: number;
  /** Continuous speech needed to emit `speech-start` (ms). */
  minSpeechMs?: number;
  /**
   * Silence tolerated mid-utterance before we declare `speech-end` (ms). Acts
   * as the "hangover" — brief gaps between words don't end the turn.
   */
  hangoverMs?: number;
  /** Emit a per-frame `inference` event in addition to start/end transitions. */
  emitInference?: boolean;
}

/** A streaming voice-activity detector. */
export interface VadDetector {
  /**
   * Feed one audio chunk. Returns the most salient event for the chunk
   * (a state transition takes priority over a plain inference) or `null`.
   */
  ingest(chunk: Uint8Array): VadEvent | null;
  /** Whether the detector currently believes the user is speaking. */
  isSpeaking(): boolean;
  /** Reset all accumulated state (call between turns/calls). */
  reset(): void;
}

/** Decode a frame to a normalized RMS energy proxy in 0..1. */
function frameRms(chunk: Uint8Array, encoding: VadEncoding): number {
  if (chunk.length === 0) return 0;

  let sumSq = 0;
  let n = 0;
  if (encoding === 'mulaw') {
    for (let i = 0; i < chunk.length; i++) {
      const s = MULAW_DECODE_TABLE[chunk[i]];
      sumSq += s * s;
      n++;
    }
    return n === 0 ? 0 : Math.sqrt(sumSq / n) / 0x7fff;
  }

  // pcm16 little-endian
  for (let i = 0; i + 1 < chunk.length; i += 2) {
    const s = (((chunk[i] | (chunk[i + 1] << 8)) << 16) >> 16);
    sumSq += s * s;
    n++;
  }
  return n === 0 ? 0 : Math.sqrt(sumSq / n) / 0x7fff;
}

function frameDurationMs(
  chunk: Uint8Array,
  encoding: VadEncoding,
  sampleRate: number,
): number {
  const bytesPerSample = encoding === 'mulaw' ? 1 : 2;
  const sampleCount = chunk.length / bytesPerSample;
  return (sampleCount / sampleRate) * 1000;
}

/**
 * Energy-based VAD with hysteresis + hangover.
 *
 * State machine (per the accumulated counters):
 *   silence --[speechThreshold sustained for minSpeechMs]--> speech (speech-start)
 *   speech  --[silence sustained for hangoverMs]----------> silence (speech-end)
 */
export class EnergyVad implements VadDetector {
  private readonly encoding: VadEncoding;
  private readonly sampleRate: number;
  private readonly speechThreshold: number;
  private readonly silenceThreshold: number;
  private readonly minSpeechMs: number;
  private readonly hangoverMs: number;
  private readonly emitInference: boolean;

  private speaking = false;
  /** Continuous speech accumulated while still below the start threshold. */
  private pendingSpeechMs = 0;
  /** Continuous speech once we've crossed into the speaking state. */
  private speechMs = 0;
  /** Continuous silence accumulated (used both for hangover and reporting). */
  private silenceMs = 0;

  constructor(config: VadConfig = {}) {
    this.encoding = config.encoding ?? 'mulaw';
    this.sampleRate = config.sampleRate ?? 8000;
    this.speechThreshold = config.speechThreshold ?? 0.05;
    // Default to a slightly lower silence threshold than speech threshold so a
    // frame hovering at the boundary doesn't flap between states.
    this.silenceThreshold = config.silenceThreshold ?? (config.speechThreshold ?? 0.05) * 0.6;
    this.minSpeechMs = config.minSpeechMs ?? 120;
    this.hangoverMs = config.hangoverMs ?? 300;
    this.emitInference = config.emitInference ?? false;
  }

  ingest(chunk: Uint8Array): VadEvent | null {
    const rms = frameRms(chunk, this.encoding);
    const durMs = frameDurationMs(chunk, this.encoding, this.sampleRate);
    return this.advance(rms, durMs);
  }

  /**
   * Advance the state machine with a precomputed probability + frame duration.
   * Shared with `SileroVad` so both impls use identical hysteresis logic.
   */
  protected advance(probability: number, durMs: number): VadEvent | null {
    const isSpeechFrame = probability >= this.speechThreshold;
    const isSilenceFrame = probability <= this.silenceThreshold;

    let transition: VadEventType | null = null;

    if (!this.speaking) {
      if (isSpeechFrame) {
        this.pendingSpeechMs += durMs;
        this.silenceMs = 0;
        if (this.pendingSpeechMs >= this.minSpeechMs) {
          this.speaking = true;
          this.speechMs = this.pendingSpeechMs;
          this.pendingSpeechMs = 0;
          transition = 'speech-start';
        }
      } else {
        // Decay any partial onset that didn't reach minSpeechMs.
        this.pendingSpeechMs = 0;
        this.silenceMs += durMs;
      }
    } else {
      if (isSilenceFrame) {
        this.silenceMs += durMs;
        if (this.silenceMs >= this.hangoverMs) {
          this.speaking = false;
          this.speechMs = 0;
          transition = 'speech-end';
        }
      } else {
        // Any non-silence frame inside an utterance resets the hangover and
        // extends the speech run.
        this.speechMs += durMs;
        this.silenceMs = 0;
      }
    }

    if (transition) {
      return {
        type: transition,
        probability,
        speechMs: this.speechMs,
        silenceMs: this.silenceMs,
      };
    }

    if (this.emitInference) {
      return {
        type: 'inference',
        probability,
        speechMs: this.speechMs,
        silenceMs: this.silenceMs,
      };
    }

    return null;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  reset(): void {
    this.speaking = false;
    this.pendingSpeechMs = 0;
    this.speechMs = 0;
    this.silenceMs = 0;
  }
}

/**
 * Hysteresis machine reused by `SileroVad`.
 *
 * `EnergyVad.advance()` holds the speech/silence state-machine + hangover logic
 * and is provider-agnostic about where the probability comes from. This thin
 * subclass exposes it so model probabilities run through the identical logic.
 */
class HysteresisMachine extends EnergyVad {
  step(probability: number, durMs: number): VadEvent | null {
    return this.advance(probability, durMs);
  }
}

/** Default location of the bundled Silero model; env-overridable. */
function defaultSileroModelPath(): string {
  return (
    process.env.VOICE_VAD_MODEL_PATH
    // The voice worker runs from the repo root via tsx against the source tree.
    ?? `${process.cwd().replace(/[\\/]+$/, '')}/src/lib/voice/ai/vad/models/silero_vad.onnx`
  );
}

/**
 * Silero VAD adapter — real ONNX inference.
 *
 * Wraps a Silero VAD ONNX model behind the `VadDetector` interface. The model is
 * far more robust to background noise / line hiss than energy thresholds and is
 * what production should use. Telephony audio (8 kHz μ-law) is decoded to
 * float32 and fed to the model in 256-sample windows — no resampling.
 *
 * Two honesty-preserving realities are handled:
 *  - **Async runtime.** ORT inference is async but `ingest()` is sync, so windows
 *    are inferred off the hot path and the resulting speech/silence transition is
 *    surfaced on a subsequent `ingest()` (~1 frame / ≤32 ms later). VAD tolerates
 *    this; it is imperceptible in conversation.
 *  - **Optional dependency.** If `onnxruntime-node` or the model asset is missing,
 *    the detector transparently runs an honest `EnergyVad` — never fake inference —
 *    and logs once. The same instance auto-upgrades to the model once it loads.
 */
export interface SileroVadConfig extends VadConfig {
  /** Filesystem path to the Silero ONNX model asset (defaults to the bundled one). */
  modelPath?: string;
}

let sileroWarned = false;

export class SileroVad implements VadDetector {
  private readonly fallback: EnergyVad;
  private readonly machine: HysteresisMachine;
  private readonly sampleRate: number;
  private readonly encoding: VadEncoding;
  private readonly session: SileroSession;

  private modelReady = false;
  /**
   * Pre-allocated scratch buffer + write offset accumulating toward a full
   * inference window. Avoids a per-frame `new Float32Array` concat (the hot path
   * runs ~50×/s/call). Sized to comfortably hold leftover (<window) + one frame.
   */
  private scratch: Float32Array;
  private bufferLen = 0;
  /** In-flight async inferences — bounds backpressure so windows can't pile up. */
  private inFlight = 0;
  private static readonly MAX_INFLIGHT = 6;
  /** Transitions produced by completed async inferences, awaiting delivery. */
  private readonly pending: VadEvent[] = [];
  private windowMs: number;

  constructor(config: SileroVadConfig = {}) {
    this.encoding = config.encoding ?? 'mulaw';
    this.sampleRate = config.sampleRate ?? 8000;
    this.fallback = new EnergyVad(config);
    // Silero probabilities are well-calibrated 0..1: use the library's standard
    // 0.5 onset / 0.35 offset thresholds rather than the energy proxy defaults.
    this.machine = new HysteresisMachine({
      ...config,
      speechThreshold: config.speechThreshold ?? 0.5,
      silenceThreshold: config.silenceThreshold ?? 0.35,
    });
    this.session = new SileroSession({
      modelPath: config.modelPath ?? defaultSileroModelPath(),
      sampleRate: this.sampleRate,
    });
    this.windowMs = (this.session.getWindowSize() / this.sampleRate) * 1000;
    // 4 windows of headroom — far more than a telephony frame ever needs.
    this.scratch = new Float32Array(this.session.getWindowSize() * 4);
    void this.load();
  }

  private async load(): Promise<void> {
    const ok = await this.session.load();
    if (ok) {
      this.modelReady = true;
      // Re-sync the window duration in case the model implied a different rate.
      this.windowMs = (this.session.getWindowSize() / this.sampleRate) * 1000;
    } else if (!sileroWarned) {
      sileroWarned = true;
      console.warn(
        '[vad] Silero VAD unavailable (onnxruntime-node or model asset missing) — '
        + 'falling back to EnergyVad. Set VOICE_VAD_MODEL_PATH or install the model.',
      );
    }
  }

  /** Decode a μ-law / PCM16 chunk into `target` at `offset`; returns sample count. */
  private decodeInto(chunk: Uint8Array, target: Float32Array, offset: number): number {
    if (this.encoding === 'mulaw') {
      for (let i = 0; i < chunk.length; i++) {
        target[offset + i] = MULAW_DECODE_TABLE[chunk[i]] / 0x8000;
      }
      return chunk.length;
    }
    const n = chunk.length >> 1;
    for (let i = 0; i < n; i++) {
      const s = (((chunk[i * 2] | (chunk[i * 2 + 1] << 8)) << 16) >> 16);
      target[offset + i] = s / 0x8000;
    }
    return n;
  }

  ingest(chunk: Uint8Array): VadEvent | null {
    if (!this.modelReady) {
      // No model yet → honest energy fallback (shared interface, real logic).
      return this.fallback.ingest(chunk);
    }

    const win = this.session.getWindowSize();
    const n = this.encoding === 'mulaw' ? chunk.length : chunk.length >> 1;
    // Defensive: if a (pathologically large) frame wouldn't fit, drop the backlog
    // rather than overrun the scratch. Telephony frames (~160 samples) never hit.
    if (this.bufferLen + n > this.scratch.length) this.bufferLen = 0;
    this.decodeInto(chunk, this.scratch, this.bufferLen);
    this.bufferLen += n;

    // Drain every complete window, inferring off the hot path. The window must be
    // a COPY (the async inference reads it after we shift the scratch). Shift the
    // tail in place with copyWithin — no reallocation.
    while (this.bufferLen >= win) {
      const window = this.scratch.slice(0, win);
      this.scratch.copyWithin(0, win, this.bufferLen);
      this.bufferLen -= win;

      // Backpressure: if inference can't keep up, drop the window (stale VAD is
      // useless) rather than letting the promise chain grow unbounded.
      if (this.inFlight >= SileroVad.MAX_INFLIGHT) continue;
      this.inFlight += 1;
      void this.session
        .process(window)
        .then((prob) => {
          this.inFlight -= 1;
          if (prob === null) return;
          const event = this.machine.step(prob, this.windowMs);
          if (event) this.pending.push(event);
        })
        .catch(() => { this.inFlight -= 1; });
    }

    // Deliver the oldest completed transition, if any.
    return this.pending.shift() ?? null;
  }

  isSpeaking(): boolean {
    return this.modelReady ? this.machine.isSpeaking() : this.fallback.isSpeaking();
  }

  reset(): void {
    this.fallback.reset();
    this.machine.reset();
    this.session.resetState();
    this.bufferLen = 0;
    this.pending.length = 0;
  }

  /** True once a real Silero session is loaded. */
  isModelReady(): boolean {
    return this.modelReady;
  }
}

/**
 * Factory: choose a VAD implementation.
 *
 * `mode: 'vad' | 'semantic'` → Silero ONNX (auto-falls-back to energy until/if
 * the model loads). Anything else → the energy detector.
 */
export function createVad(
  config: VadConfig & { mode?: 'energy' | 'vad' | 'semantic'; modelPath?: string } = {},
): VadDetector {
  const { mode, modelPath, ...rest } = config;
  if (mode === 'vad' || mode === 'semantic') {
    return new SileroVad({ ...rest, modelPath });
  }
  return new EnergyVad(rest);
}
