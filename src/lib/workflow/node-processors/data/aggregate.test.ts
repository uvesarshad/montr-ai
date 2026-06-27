import { describe, it, expect } from 'vitest';
import { AggregateProcessor } from './aggregate';
import type { NodeProcessorContext } from '../index';

function run(config: Record<string, unknown>) {
  const ctx = { config } as unknown as NodeProcessorContext;
  return new AggregateProcessor().execute(ctx);
}

const DEALS = [
  { stage: 'open', amount: 100, owner: 'a' },
  { stage: 'open', amount: 300, owner: 'b' },
  { stage: 'won', amount: 50, owner: 'a' },
];

describe('AggregateProcessor.execute — flat (no groupBy)', () => {
  it('counts all items when no aggregations supplied', async () => {
    const out = await run({ source: DEALS });
    expect(out.success).toBe(true);
    expect(out.count).toBe(3);
  });

  it('sums and averages a numeric field with default output keys', async () => {
    const out = await run({
      source: DEALS,
      aggregations: [
        { field: 'amount', op: 'sum' },
        { field: 'amount', op: 'avg' },
      ],
    });
    expect(out.sum_amount).toBe(450);
    expect(out.avg_amount).toBe(150);
  });

  it('honors a custom `as` output key', async () => {
    const out = await run({
      source: DEALS,
      aggregations: [{ field: 'amount', op: 'sum', as: 'total' }],
    });
    expect(out.total).toBe(450);
    expect(out.sum_amount).toBeUndefined();
  });

  it('computes numeric min/max', async () => {
    const out = await run({
      source: DEALS,
      aggregations: [
        { field: 'amount', op: 'min', as: 'lo' },
        { field: 'amount', op: 'max', as: 'hi' },
      ],
    });
    expect(out.lo).toBe(50);
    expect(out.hi).toBe(300);
  });

  it('falls back to lexical min/max for non-numeric fields', async () => {
    const out = await run({
      source: DEALS,
      aggregations: [
        { field: 'owner', op: 'min', as: 'firstOwner' },
        { field: 'owner', op: 'max', as: 'lastOwner' },
      ],
    });
    expect(out.firstOwner).toBe('a');
    expect(out.lastOwner).toBe('b');
  });

  it('returns first/last item field values', async () => {
    const out = await run({
      source: DEALS,
      aggregations: [
        { field: 'stage', op: 'first', as: 'f' },
        { field: 'stage', op: 'last', as: 'l' },
      ],
    });
    expect(out.f).toBe('open');
    expect(out.l).toBe('won');
  });

  it('avg of an empty set is 0', async () => {
    const out = await run({
      source: [],
      aggregations: [{ field: 'amount', op: 'avg', as: 'a' }],
    });
    expect(out.count).toBe(0);
    expect(out.a).toBe(0);
  });
});

describe('AggregateProcessor.execute — groupBy', () => {
  it('groups preserving first-seen key order with per-group counts + aggs', async () => {
    const out = await run({
      source: DEALS,
      groupBy: 'stage',
      aggregations: [{ field: 'amount', op: 'sum', as: 'total' }],
    });
    const groups = out.groups as Array<{ key: unknown; count: number; total: number }>;
    expect(out.count).toBe(2); // two distinct stages
    expect(groups.map((g) => g.key)).toEqual(['open', 'won']);
    expect(groups[0]).toMatchObject({ key: 'open', count: 2, total: 400 });
    expect(groups[1]).toMatchObject({ key: 'won', count: 1, total: 50 });
  });

  it('buckets null/missing group keys under a null key', async () => {
    const out = await run({
      source: [{ x: 1 }, { stage: 'open' }],
      groupBy: 'stage',
    });
    const groups = out.groups as Array<{ key: unknown; count: number }>;
    const nullGroup = groups.find((g) => g.key === null);
    expect(nullGroup?.count).toBe(1);
  });
});

describe('AggregateProcessor.validate', () => {
  const proc = new AggregateProcessor();

  it('accepts a valid aggregations array', () => {
    expect(proc.validate({ aggregations: [{ field: 'amount', op: 'sum' }] }).valid).toBe(true);
  });

  it('rejects a non-array aggregations value', () => {
    const res = proc.validate({ aggregations: 'nope' });
    expect(res.valid).toBe(false);
    expect(res.errors?.[0]).toMatch(/must be an array/);
  });

  it('rejects an invalid aggregation op', () => {
    const res = proc.validate({ aggregations: [{ field: 'amount', op: 'median' }] });
    expect(res.valid).toBe(false);
    expect(res.errors?.[0]).toMatch(/invalid aggregation op/);
  });
});
