/**
 * Worker load computation (LiveKit `_DefaultLoadCalc` analog).
 *
 * A voice worker's "load" is a single 0..1 scalar the dispatcher / registry use
 * to decide whether the worker can accept another live call. We blend two
 * signals:
 *   1. **Session pressure** — active media sessions / maxSessions. This is the
 *      dominant term: a call worker is fundamentally bounded by how many
 *      concurrent media bridges it can pump audio for.
 *   2. **CPU pressure** — a normalized OS load-average sample. Media
 *      transcoding + STT/TTS streaming is CPU-bound, so a box that's pinned on
 *      CPU should shed work even if it's under its session cap.
 *
 * The effective load is the MAX of the two (whichever resource is scarcest),
 * matching LiveKit's "worst-resource-wins" intuition. `isAvailable` is the
 * admission gate the worker uses before claiming a new call.
 */

import os from 'os';

export interface LoadInputs {
  /** Live media sessions this worker is currently driving. */
  activeSessions: number;
  /** Hard ceiling on concurrent sessions for this worker. */
  maxSessions: number;
}

export interface LoadSample {
  /** Effective 0..1 load (max of session + cpu pressure). */
  load: number;
  /** Session-pressure component (activeSessions / maxSessions). */
  sessionLoad: number;
  /** CPU-pressure component (1-min loadavg / cpuCount, clamped). */
  cpuLoad: number;
}

/** Default availability threshold — a worker over this sheds new work. */
export const DEFAULT_LOAD_THRESHOLD = 0.7;

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Sample current CPU pressure as a 0..1 scalar. Uses the 1-minute load average
 * divided by the logical CPU count (a loadavg == cpuCount means "fully busy").
 *
 * `os.loadavg()` returns `[0, 0, 0]` on Windows, where there is no real load
 * average. In that case we fall back to 0 — session pressure becomes the only
 * signal, which is the right behavior for a dev box.
 */
export function sampleCpuLoad(): number {
  const cpuCount = Math.max(1, os.cpus()?.length ?? 1);
  const [oneMin] = os.loadavg();
  if (!oneMin || oneMin <= 0) return 0; // Windows / no data
  return clamp01(oneMin / cpuCount);
}

/**
 * Compute the effective worker load from session pressure + a fresh CPU sample.
 * Returns the blended scalar plus its components (handy for the /healthz view).
 */
export function computeLoad(inputs: LoadInputs): LoadSample {
  const maxSessions = Math.max(1, inputs.maxSessions);
  const sessionLoad = clamp01(inputs.activeSessions / maxSessions);
  const cpuLoad = sampleCpuLoad();
  // Worst-resource-wins: whichever is scarcest gates admission.
  const load = Math.max(sessionLoad, cpuLoad);
  return { load, sessionLoad, cpuLoad };
}

/**
 * True when a worker at the given load can accept another call. A worker that
 * is already AT its session ceiling is never available regardless of CPU.
 */
export function isAvailable(load: number, threshold: number = DEFAULT_LOAD_THRESHOLD): boolean {
  return load < threshold;
}
