import { describe, it, expect } from 'vitest';
import { SortProcessor } from './sort';
import type { NodeProcessorContext } from '../index';

/**
 * resolveSource passes through non-string `source` values untouched, so tests
 * supply the array directly as config.source — no variable resolver needed.
 */
function run(config: Record<string, unknown>) {
  const ctx = { config } as unknown as NodeProcessorContext;
  return new SortProcessor().execute(ctx);
}

describe('SortProcessor.execute', () => {
  it('sorts strings ascending by a field (default direction/type)', async () => {
    const out = await run({
      source: [{ name: 'Charlie' }, { name: 'alice' }, { name: 'Bob' }],
      field: 'name',
    });
    expect((out.items as Array<{ name: string }>).map((i) => i.name)).toEqual([
      'alice',
      'Bob',
      'Charlie',
    ]);
    expect(out.count).toBe(3);
    expect(out.success).toBe(true);
  });

  it('sorts descending when direction=desc', async () => {
    const out = await run({
      source: [{ n: 1 }, { n: 3 }, { n: 2 }],
      field: 'n',
      type: 'number',
      direction: 'desc',
    });
    expect((out.items as Array<{ n: number }>).map((i) => i.n)).toEqual([3, 2, 1]);
  });

  it('sorts numerically (not lexically) with type=number', async () => {
    const out = await run({
      source: [{ n: 10 }, { n: 2 }, { n: 1 }],
      field: 'n',
      type: 'number',
    });
    expect((out.items as Array<{ n: number }>).map((i) => i.n)).toEqual([1, 2, 10]);
  });

  it('sorts by date with type=date', async () => {
    const out = await run({
      source: [
        { at: '2026-03-01' },
        { at: '2026-01-01' },
        { at: '2026-02-01' },
      ],
      field: 'at',
      type: 'date',
    });
    expect((out.items as Array<{ at: string }>).map((i) => i.at)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
  });

  it('sorts primitives by the item itself when no field given', async () => {
    const out = await run({ source: [3, 1, 2], type: 'number' });
    expect(out.items).toEqual([1, 2, 3]);
  });

  it('does not mutate the input array', async () => {
    const source = [{ n: 3 }, { n: 1 }, { n: 2 }];
    await run({ source, field: 'n', type: 'number' });
    expect(source.map((i) => i.n)).toEqual([3, 1, 2]);
  });

  it('returns an empty result for a non-array / empty source', async () => {
    const out = await run({ source: null });
    expect(out.items).toEqual([]);
    expect(out.count).toBe(0);
  });
});
