/**
 * Barge-in detector.
 *
 * Measures the RMS energy of incoming μ-law / PCM audio frames over a short
 * window. When energy exceeds a threshold for at least `minActiveMs`, fires
 * `onBargeIn` once until the user goes quiet again. The conversation engine
 * uses this to cut off in-progress TTS playback the moment the caller starts
 * speaking — a critical UX property of voice agents.
 */

export interface BargeInDetectorOptions {
  /** RMS threshold (0..1 normalized) above which a frame counts as speech. */
  threshold?: number;
  /** Minimum continuous active milliseconds to count as barge-in. */
  minActiveMs?: number;
  /** Audio sample rate (Hz). Used to convert frame size to milliseconds. */
  sampleRate?: number;
  /** Audio encoding. */
  encoding?: 'mulaw' | 'pcm16';
  onBargeIn: () => void;
}

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

function frameRms(chunk: Uint8Array, encoding: 'mulaw' | 'pcm16'): number {
  if (chunk.length === 0) return 0;

  let sumSq = 0;
  let n = 0;
  if (encoding === 'mulaw') {
    for (let i = 0; i < chunk.length; i++) {
      const s = MULAW_DECODE_TABLE[chunk[i]];
      sumSq += s * s;
      n++;
    }
    return Math.sqrt(sumSq / n) / 0x7fff;
  }

  // pcm16 little-endian
  for (let i = 0; i + 1 < chunk.length; i += 2) {
    const s = (chunk[i] | (chunk[i + 1] << 8)) << 16 >> 16;
    sumSq += s * s;
    n++;
  }
  if (n === 0) return 0;
  return Math.sqrt(sumSq / n) / 0x7fff;
}

export function createBargeInDetector(options: BargeInDetectorOptions): {
  ingest: (chunk: Uint8Array) => void;
  reset: () => void;
} {
  const threshold = options.threshold ?? 0.05;
  const minActiveMs = options.minActiveMs ?? 200;
  const sampleRate = options.sampleRate ?? 8000;
  const encoding = options.encoding ?? 'mulaw';

  let consecutiveActiveSamples = 0;
  let fired = false;

  return {
    ingest(chunk: Uint8Array) {
      const rms = frameRms(chunk, encoding);
      const bytesPerSample = encoding === 'mulaw' ? 1 : 2;
      const sampleCount = chunk.length / bytesPerSample;

      if (rms >= threshold) {
        consecutiveActiveSamples += sampleCount;
        const activeMs = (consecutiveActiveSamples / sampleRate) * 1000;
        if (!fired && activeMs >= minActiveMs) {
          fired = true;
          try {
            options.onBargeIn();
          } catch (err) {
            console.error('[barge-in] callback threw:', err);
          }
        }
      } else {
        consecutiveActiveSamples = 0;
        fired = false;
      }
    },
    reset() {
      consecutiveActiveSamples = 0;
      fired = false;
    },
  };
}
