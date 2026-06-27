import { describe, it, expect } from 'vitest';
import { DateTimeProcessor } from './date-time';
import type { NodeProcessorContext } from '../index';

/** Minimal context — the DateTime processor only reads `config`. */
function run(config: Record<string, unknown>) {
  const ctx = { config } as unknown as NodeProcessorContext;
  return new DateTimeProcessor().execute(ctx);
}

describe('DateTimeProcessor.execute', () => {
  it('returns an ISO "now" by default and for op="now"', async () => {
    const out = await run({ op: 'now' });
    expect(out.success).toBe(true);
    expect(typeof out.result).toBe('string');
    expect(() => new Date(out.result as string)).not.toThrow();
    expect(Number.isNaN(Date.parse(out.result as string))).toBe(false);
  });

  it('falls back to "now" for an unknown op', async () => {
    const out = await run({ op: 'frobnicate' });
    expect(out.success).toBe(true);
    expect(Number.isNaN(Date.parse(out.result as string))).toBe(false);
  });

  it('adds days to an ISO input', async () => {
    const out = await run({
      op: 'add',
      input: '2026-01-01T00:00:00.000Z',
      amount: 5,
      unit: 'days',
    });
    expect(out.result).toBe('2026-01-06T00:00:00.000Z');
  });

  it('subtracts hours from an ISO input', async () => {
    const out = await run({
      op: 'subtract',
      input: '2026-01-01T12:00:00.000Z',
      amount: 2,
      unit: 'hours',
    });
    expect(out.result).toBe('2026-01-01T10:00:00.000Z');
  });

  it('defaults unit to days and amount to 0 when omitted/invalid', async () => {
    const out = await run({
      op: 'add',
      input: '2026-01-01T00:00:00.000Z',
      amount: 'not-a-number',
    });
    expect(out.result).toBe('2026-01-01T00:00:00.000Z');
  });

  it('parses an epoch-ms numeric string to ISO', async () => {
    const out = await run({ op: 'parse', input: '0' });
    expect(out.result).toBe('1970-01-01T00:00:00.000Z');
  });

  it('formats with a date-fns format string', async () => {
    const out = await run({
      op: 'format',
      input: '2026-03-09T00:00:00.000Z',
      format: 'yyyy-MM-dd',
    });
    expect(out.result).toBe('2026-03-09');
  });

  it('format without a format string returns ISO', async () => {
    const out = await run({ op: 'format', input: '2026-03-09T05:00:00.000Z' });
    expect(out.result).toBe('2026-03-09T05:00:00.000Z');
  });

  it('computes diff (input - input2) in the chosen unit', async () => {
    const out = await run({
      op: 'diff',
      input: '2026-01-10T00:00:00.000Z',
      input2: '2026-01-01T00:00:00.000Z',
      unit: 'days',
    });
    expect(out.result).toBe(9);
  });

  it('throws on an unparseable date input', async () => {
    await expect(run({ op: 'parse', input: 'totally-not-a-date' })).rejects.toThrow(
      /Could not parse date/,
    );
  });
});

describe('DateTimeProcessor.validate', () => {
  const proc = new DateTimeProcessor();

  it('accepts a valid op', () => {
    expect(proc.validate({ op: 'add' })).toEqual({ valid: true, errors: undefined });
  });

  it('accepts an empty config (op optional)', () => {
    expect(proc.validate({}).valid).toBe(true);
  });

  it('rejects an invalid op with a helpful message', () => {
    const res = proc.validate({ op: 'explode' });
    expect(res.valid).toBe(false);
    expect(res.errors?.[0]).toMatch(/op must be one of/);
  });
});
