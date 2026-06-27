/**
 * Barge-in detector tests.
 */

import { describe, it, expect } from 'vitest';

import { createBargeInDetector } from './barge-in';

/** Build a PCM16 LE frame of constant amplitude. */
function makePcm16(samples: number, amplitude: number): Uint8Array {
  const buf = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const value = amplitude & 0xffff;
    buf[i * 2] = value & 0xff;
    buf[i * 2 + 1] = (value >> 8) & 0xff;
  }
  return buf;
}

describe('createBargeInDetector', () => {
  it('does not fire on silent frames', () => {
    let fired = false;
    const detector = createBargeInDetector({
      encoding: 'pcm16',
      sampleRate: 8000,
      threshold: 0.05,
      minActiveMs: 100,
      onBargeIn: () => {
        fired = true;
      },
    });

    // 1 second of silence (8000 samples).
    detector.ingest(makePcm16(8000, 0));
    expect(fired).toBe(false);
  });

  it('fires after minActiveMs of loud speech', () => {
    let fired = 0;
    const detector = createBargeInDetector({
      encoding: 'pcm16',
      sampleRate: 8000,
      threshold: 0.05,
      minActiveMs: 100,
      onBargeIn: () => {
        fired++;
      },
    });

    // 200ms = 1600 samples of loud audio.
    detector.ingest(makePcm16(1600, 0x7000));
    expect(fired).toBe(1);
  });

  it('fires only once per active stretch (resets on silence)', () => {
    let fired = 0;
    const detector = createBargeInDetector({
      encoding: 'pcm16',
      sampleRate: 8000,
      threshold: 0.05,
      minActiveMs: 50,
      onBargeIn: () => {
        fired++;
      },
    });

    // First active stretch — fires.
    detector.ingest(makePcm16(800, 0x7000));
    expect(fired).toBe(1);

    // More loud audio in the same stretch — still 1 (latched).
    detector.ingest(makePcm16(800, 0x7000));
    expect(fired).toBe(1);

    // Silence resets.
    detector.ingest(makePcm16(8000, 0));

    // Second active stretch — fires again.
    detector.ingest(makePcm16(800, 0x7000));
    expect(fired).toBe(2);
  });

  it('reset() clears latched state', () => {
    let fired = 0;
    const detector = createBargeInDetector({
      encoding: 'pcm16',
      sampleRate: 8000,
      threshold: 0.05,
      minActiveMs: 50,
      onBargeIn: () => {
        fired++;
      },
    });
    detector.ingest(makePcm16(800, 0x7000));
    expect(fired).toBe(1);
    detector.reset();
    detector.ingest(makePcm16(800, 0x7000));
    expect(fired).toBe(2);
  });
});
