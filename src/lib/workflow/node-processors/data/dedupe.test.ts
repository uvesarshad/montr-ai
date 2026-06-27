import { describe, it, expect } from 'vitest';
import { DedupeProcessor } from './dedupe';
import type { NodeProcessorContext } from '../index';

function run(config: Record<string, unknown>) {
  const ctx = { config } as unknown as NodeProcessorContext;
  return new DedupeProcessor().execute(ctx);
}

describe('DedupeProcessor.execute — whole-item compare (no compareBy)', () => {
  it('removes structurally-identical duplicates', async () => {
    const out = await run({ source: [{ a: 1 }, { a: 1 }, { a: 2 }] });
    expect(out.success).toBe(true);
    expect(out.count).toBe(2);
    expect(out.removed).toBe(1);
    expect(out.items).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('treats key-order-different objects as duplicates only when JSON matches', async () => {
    // JSON.stringify is order-sensitive, so {a:1,b:2} !== {b:2,a:1}
    const out = await run({ source: [{ a: 1, b: 2 }, { b: 2, a: 1 }] });
    expect(out.count).toBe(2);
    expect(out.removed).toBe(0);
  });

  it('handles an empty / missing source as zero items', async () => {
    const out = await run({});
    expect(out.count).toBe(0);
    expect(out.removed).toBe(0);
    expect(out.items).toEqual([]);
  });

  it('unwraps the {records:[...]} envelope', async () => {
    const out = await run({ source: { records: [{ x: 1 }, { x: 1 }] } });
    expect(out.count).toBe(1);
  });
});

describe('DedupeProcessor.execute — compareBy fields', () => {
  const ROWS = [
    { id: 1, email: 'a@x.com', name: 'A' },
    { id: 2, email: 'a@x.com', name: 'B' },
    { id: 3, email: 'c@x.com', name: 'C' },
  ];

  it('keeps the FIRST duplicate by default', async () => {
    const out = await run({ source: ROWS, compareBy: 'email' });
    expect(out.count).toBe(2);
    expect(out.removed).toBe(1);
    expect((out.items as Array<{ name: string }>)[0].name).toBe('A');
  });

  it('keeps the LAST duplicate when keep=last (preserving original slot)', async () => {
    const out = await run({ source: ROWS, compareBy: 'email', keep: 'last' });
    expect(out.count).toBe(2);
    const items = out.items as Array<{ name: string }>;
    // The 'a@x.com' slot now holds B (the later dup); position is preserved.
    expect(items[0].name).toBe('B');
    expect(items[1].name).toBe('C');
  });

  it('supports multi-field compound keys (comma-separated, trims spaces)', async () => {
    const rows = [
      { a: '1', b: '2' },
      { a: '1', b: '3' },
      { a: '1', b: '2' },
    ];
    const out = await run({ source: rows, compareBy: ' a , b ' });
    expect(out.count).toBe(2);
  });

  it('reads dotted paths in compare fields', async () => {
    const rows = [
      { user: { id: 7 } },
      { user: { id: 7 } },
      { user: { id: 8 } },
    ];
    const out = await run({ source: rows, compareBy: 'user.id' });
    expect(out.count).toBe(2);
  });

  it('treats null/undefined compare values as the same bucket', async () => {
    const rows = [{ email: null }, { email: undefined }, { email: 'z' }];
    const out = await run({ source: rows, compareBy: 'email' });
    expect(out.count).toBe(2);
  });
});
