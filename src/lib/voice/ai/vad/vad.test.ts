/**
 * VAD unit tests.
 *
 * `EnergyVad` is pure/deterministic and fully covered here. `SileroVad`'s real
 * ONNX inference is verified out-of-band (it needs the native runtime + model
 * asset); here we assert its graceful, honest fallback to the energy detector
 * when no model is available — which is the behavior that must never regress.
 */
import { describe, it, expect } from 'vitest';
import { EnergyVad, SileroVad, createVad } from './index';

/** Build a PCM16-LE frame of `samples` at a constant amplitude. */
function pcm16Frame(amplitude: number, samples = 256): Uint8Array {
  const buf = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = i % 2 === 0 ? amplitude : -amplitude; // alternate so RMS = |amp|
    buf[i * 2] = v & 0xff;
    buf[i * 2 + 1] = (v >> 8) & 0xff;
  }
  return buf;
}

const LOUD = pcm16Frame(16000); // rms ~0.49 normalized → speech
const QUIET = pcm16Frame(0); // silence

describe('EnergyVad', () => {
  it('emits speech-start after sustained speech and speech-end after hangover', () => {
    const vad = new EnergyVad({
      encoding: 'pcm16',
      sampleRate: 8000,
      speechThreshold: 0.05,
      minSpeechMs: 100, // 256 samples @8k = 32ms → ~4 frames
      hangoverMs: 200,
    });

    let started = false;
    for (let i = 0; i < 6 && !started; i++) {
      if (vad.ingest(LOUD)?.type === 'speech-start') started = true;
    }
    expect(started).toBe(true);
    expect(vad.isSpeaking()).toBe(true);

    let ended = false;
    for (let i = 0; i < 12 && !ended; i++) {
      if (vad.ingest(QUIET)?.type === 'speech-end') ended = true;
    }
    expect(ended).toBe(true);
    expect(vad.isSpeaking()).toBe(false);
  });

  it('does not start on a single noisy frame (hysteresis)', () => {
    const vad = new EnergyVad({ encoding: 'pcm16', sampleRate: 8000, minSpeechMs: 100 });
    const ev = vad.ingest(LOUD); // one 32ms frame < minSpeechMs
    expect(ev).toBeNull();
    expect(vad.isSpeaking()).toBe(false);
  });

  it('resets cleanly', () => {
    const vad = new EnergyVad({ encoding: 'pcm16', sampleRate: 8000, minSpeechMs: 100 });
    for (let i = 0; i < 6; i++) vad.ingest(LOUD);
    vad.reset();
    expect(vad.isSpeaking()).toBe(false);
  });
});

describe('SileroVad fallback', () => {
  it('falls back to energy detection when no model is available', () => {
    // Invalid model path → async load fails → honest EnergyVad fallback. The
    // model load is async, so immediately after construction the detector is in
    // fallback mode and must still detect speech via energy.
    const vad = new SileroVad({
      encoding: 'pcm16',
      sampleRate: 8000,
      modelPath: '/__nonexistent__/silero_vad.onnx',
      minSpeechMs: 100,
      hangoverMs: 200,
    });
    expect(vad.isModelReady()).toBe(false);

    let started = false;
    for (let i = 0; i < 6 && !started; i++) {
      if (vad.ingest(LOUD)?.type === 'speech-start') started = true;
    }
    expect(started).toBe(true);
  });
});

describe('createVad', () => {
  it('returns EnergyVad for energy/unset mode and a detector for vad mode', () => {
    expect(createVad({ mode: 'energy' })).toBeInstanceOf(EnergyVad);
    // vad/semantic → SileroVad (which itself falls back internally).
    expect(createVad({ mode: 'vad', modelPath: '/__nope__.onnx' })).toBeInstanceOf(SileroVad);
  });
});
