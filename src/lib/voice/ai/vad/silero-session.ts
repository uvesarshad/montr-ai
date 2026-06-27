/**
 * Stateful Silero VAD ONNX session wrapper.
 *
 * Encapsulates the `onnxruntime-node` session + the model's recurrent state so
 * the `SileroVad` detector can stay focused on the hysteresis state machine.
 *
 * Robust to model version: the Silero ONNX export has shipped two I/O shapes —
 *   - **v5** (current): inputs `input[1,T]`, `state[2,1,128]`, `sr` → outputs
 *     `output[1,1]`, `stateN[2,1,128]`.
 *   - **v4**: inputs `input[1,T]`, `sr`, `h[2,1,64]`, `c[2,1,64]` → outputs
 *     `output`, `hn`, `cn`.
 * We detect which by inspecting `session.inputNames` at load and carry the
 * recurrent state forward across windows accordingly.
 *
 * Telephony audio is 8 kHz, so the window is **256 samples** (32 ms hop) and we
 * pass `sr = 8000` — no resampling. Inference is async (ORT has no sync API), so
 * `process()` returns a Promise; calls are serialized through an internal chain
 * because each step depends on the previous step's recurrent state.
 *
 * The native dependency is imported lazily inside `load()` so merely importing
 * this module never pulls the native addon into a bundle or a non-worker process.
 */

// Minimal structural types so we don't hard-depend on the addon's types at
// compile time (it's an optional runtime dependency, externalized in next.config).
interface OrtTensor {
  data: unknown;
}
interface OrtTensorCtor {
  new (type: string, data: ArrayLike<number> | BigInt64Array | Float32Array, dims: number[]): OrtTensor;
}
interface OrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  Tensor: OrtTensorCtor;
  InferenceSession: { create(path: string): Promise<OrtSession> };
}

/** Number of audio samples per inference window at 8 kHz (Silero requirement). */
export const SILERO_WINDOW_8K = 256;
/** Number of audio samples per inference window at 16 kHz. */
export const SILERO_WINDOW_16K = 512;

let ortLoad: Promise<OrtModule | null> | null = null;

/** Lazily load `onnxruntime-node`; cached. Returns null if unavailable. */
function loadOrt(): Promise<OrtModule | null> {
  if (!ortLoad) {
    ortLoad = (async () => {
      try {
        // Lazy require so the native addon is only touched at runtime in a
        // worker/voice-ws process — never at module-eval or in the Next bundle.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('onnxruntime-node') as OrtModule;
        return mod && mod.InferenceSession ? mod : null;
      } catch {
        return null;
      }
    })();
  }
  return ortLoad;
}

export interface SileroSessionOptions {
  modelPath: string;
  /** Audio sample rate fed to the model (8000 for telephony). */
  sampleRate?: number;
}

export class SileroSession {
  private readonly modelPath: string;
  private readonly sampleRate: number;
  private readonly windowSize: number;

  private ort: OrtModule | null = null;
  private session: OrtSession | null = null;
  private variant: 'v5' | 'v4' = 'v5';
  private ready = false;

  // Recurrent state carried across windows.
  private state = new Float32Array(2 * 1 * 128); // v5
  private h = new Float32Array(2 * 1 * 64); // v4
  private c = new Float32Array(2 * 1 * 64); // v4

  /**
   * Silero v5 needs a small context of the previous window's trailing samples
   * prepended to each input (64 samples @16k, 32 @8k). Without it the model
   * mis-frames and outputs ~0 on clear speech. v4 ignores this.
   */
  private readonly contextSize: number;
  private context: Float32Array;

  // Serialize inference: each window depends on the prior window's state.
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: SileroSessionOptions) {
    this.modelPath = opts.modelPath;
    this.sampleRate = opts.sampleRate ?? 8000;
    this.windowSize = this.sampleRate >= 16000 ? SILERO_WINDOW_16K : SILERO_WINDOW_8K;
    this.contextSize = this.sampleRate >= 16000 ? 64 : 32;
    this.context = new Float32Array(this.contextSize);
  }

  /** Window size (in float32 samples) the caller must feed to `process()`. */
  getWindowSize(): number {
    return this.windowSize;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Load the ONNX session. Resolves `true` on success, `false` if the runtime
   * or model is unavailable (caller then falls back to the energy detector).
   */
  async load(): Promise<boolean> {
    const ort = await loadOrt();
    if (!ort) return false;
    try {
      this.session = await ort.InferenceSession.create(this.modelPath);
      this.ort = ort;
      this.variant = this.session.inputNames.includes('state') ? 'v5' : 'v4';
      this.resetState();
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  /** Clear the recurrent state + context (call between calls/turns). */
  resetState(): void {
    this.state = new Float32Array(2 * 1 * 128);
    this.h = new Float32Array(2 * 1 * 64);
    this.c = new Float32Array(2 * 1 * 64);
    this.context = new Float32Array(this.contextSize);
  }

  /**
   * Run one window of exactly `getWindowSize()` float32 samples (normalized to
   * [-1, 1]) and return the speech probability (0..1), or `null` if the model is
   * not ready or inference failed. Calls are serialized internally.
   */
  async process(window: Float32Array): Promise<number | null> {
    if (!this.ready || !this.ort || !this.session) return null;
    const ort = this.ort;
    const session = this.session;

    let prob: number | null = null;
    const run = this.chain.then(async () => {
      const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(this.sampleRate)]), []);

      let feeds: Record<string, OrtTensor>;
      if (this.variant === 'v5') {
        // Prepend the carried context so the model frames the window correctly.
        const framed = new Float32Array(this.contextSize + window.length);
        framed.set(this.context, 0);
        framed.set(window, this.contextSize);
        const input = new ort.Tensor('float32', framed, [1, framed.length]);
        feeds = { input, state: new ort.Tensor('float32', this.state, [2, 1, 128]), sr };
        // Next context = this window's trailing `contextSize` samples.
        this.context = window.slice(window.length - this.contextSize);
      } else {
        const input = new ort.Tensor('float32', window, [1, window.length]);
        feeds = {
          input,
          sr,
          h: new ort.Tensor('float32', this.h, [2, 1, 64]),
          c: new ort.Tensor('float32', this.c, [2, 1, 64]),
        };
      }

      const out = await session.run(feeds);
      // Copy the recurrent state into an owned buffer (avoids typed-array buffer
      // aliasing and the ArrayBufferLike vs ArrayBuffer generic mismatch).
      if (this.variant === 'v5') {
        this.state = new Float32Array(out.stateN.data as Float32Array);
      } else {
        this.h = new Float32Array(out.hn.data as Float32Array);
        this.c = new Float32Array(out.cn.data as Float32Array);
      }
      const probData = out.output.data as Float32Array;
      prob = probData[0];
    });

    // Keep the chain alive even if this run throws, so a single failed window
    // doesn't wedge the detector permanently.
    this.chain = run.catch(() => undefined);
    try {
      await run;
    } catch {
      return null;
    }
    return prob;
  }
}
