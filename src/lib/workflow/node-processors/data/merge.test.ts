import { describe, it, expect } from 'vitest';
import { MergeProcessor } from './merge';
import type { NodeProcessorContext } from '../index';

function run(config: Record<string, unknown>) {
  const ctx = { config } as unknown as NodeProcessorContext;
  return new MergeProcessor().execute(ctx);
}

describe('MergeProcessor.execute — append (default)', () => {
  it('concatenates both arrays', async () => {
    const out = await run({ sourceA: [{ a: 1 }], sourceB: [{ b: 2 }, { b: 3 }] });
    expect(out.success).toBe(true);
    expect(out.count).toBe(3);
    expect(out.items).toEqual([{ a: 1 }, { b: 2 }, { b: 3 }]);
  });

  it('treats missing sources as empty arrays', async () => {
    const out = await run({});
    expect(out.count).toBe(0);
    expect(out.items).toEqual([]);
  });

  it('unwraps {records:[...]} envelopes on both sides', async () => {
    const out = await run({
      sourceA: { records: [{ a: 1 }] },
      sourceB: { records: [{ b: 2 }] },
    });
    expect(out.count).toBe(2);
  });
});

describe('MergeProcessor.execute — combine-fields', () => {
  it('shallow-merges two objects with B winning on conflicts', async () => {
    const out = await run({
      mode: 'combine-fields',
      sourceA: { a: 1, shared: 'A' },
      sourceB: { b: 2, shared: 'B' },
    });
    expect(out.count).toBe(1);
    expect(out.item).toEqual({ a: 1, shared: 'B', b: 2 });
  });

  it('wraps non-object inputs under {value} before merging', async () => {
    const out = await run({ mode: 'combine-fields', sourceA: 5, sourceB: { b: 2 } });
    expect(out.item).toEqual({ value: 5, b: 2 });
  });
});

describe('MergeProcessor.execute — merge-by-key', () => {
  it('merges matched items and appends B-only items', async () => {
    const out = await run({
      mode: 'merge-by-key',
      key: 'id',
      sourceA: [
        { id: 1, name: 'A1' },
        { id: 2, name: 'A2' },
      ],
      sourceB: [
        { id: 1, extra: 'X' },
        { id: 3, name: 'B3' },
      ],
    });
    expect(out.count).toBe(3);
    const items = out.items as Array<Record<string, unknown>>;
    expect(items[0]).toEqual({ id: 1, name: 'A1', extra: 'X' });
    expect(items[1]).toEqual({ id: 2, name: 'A2' }); // A-only, untouched
    expect(items[2]).toEqual({ id: 3, name: 'B3' }); // B-only, appended
  });

  it('keeps A items with no key value as-is (undefined key never matches)', async () => {
    const out = await run({
      mode: 'merge-by-key',
      key: 'id',
      sourceA: [{ name: 'no-id' }],
      sourceB: [{ id: 1, name: 'has-id' }],
    });
    expect(out.count).toBe(2);
  });

  it('uses the LAST B item when B has duplicate keys', async () => {
    const out = await run({
      mode: 'merge-by-key',
      key: 'id',
      sourceA: [{ id: 1 }],
      sourceB: [
        { id: 1, v: 'first' },
        { id: 1, v: 'last' },
      ],
    });
    const items = out.items as Array<Record<string, unknown>>;
    expect(items[0]).toEqual({ id: 1, v: 'last' });
  });

  it('throws when key is missing', async () => {
    await expect(
      run({ mode: 'merge-by-key', sourceA: [{ id: 1 }], sourceB: [] })
    ).rejects.toThrow(/requires a key/i);
  });
});

describe('MergeProcessor.validate', () => {
  it('accepts the three valid modes', () => {
    const p = new MergeProcessor();
    expect(p.validate({ mode: 'append' }).valid).toBe(true);
    expect(p.validate({ mode: 'combine-fields' }).valid).toBe(true);
    expect(p.validate({ mode: 'merge-by-key', key: 'id' }).valid).toBe(true);
  });

  it('rejects an unknown mode', () => {
    const res = new MergeProcessor().validate({ mode: 'frobnicate' });
    expect(res.valid).toBe(false);
  });

  it('rejects merge-by-key without a key', () => {
    const res = new MergeProcessor().validate({ mode: 'merge-by-key' });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => /key field/.test(e))).toBe(true);
  });
});
