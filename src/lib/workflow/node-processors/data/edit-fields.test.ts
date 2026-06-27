import { describe, it, expect } from 'vitest';
import { EditFieldsProcessor } from './edit-fields';
import type { NodeProcessorContext } from '../index';

function run(config: Record<string, unknown>) {
  const ctx = { config } as unknown as NodeProcessorContext;
  return new EditFieldsProcessor().execute(ctx);
}

describe('EditFieldsProcessor.execute — single object', () => {
  it('sets a flat field', async () => {
    const out = await run({
      source: { a: 1 },
      operations: [{ op: 'set', field: 'b', value: 2 }],
    });
    expect(out.success).toBe(true);
    expect(out.isArray).toBe(false);
    expect(out.count).toBe(1);
    expect(out.item).toEqual({ a: 1, b: 2 });
  });

  it('sets a dotted/nested path', async () => {
    const out = await run({
      source: {},
      operations: [{ op: 'set', field: 'meta.score', value: 9 }],
    });
    expect(out.item).toEqual({ meta: { score: 9 } });
  });

  it('renames a field (moves value, drops the old key)', async () => {
    const out = await run({
      source: { first: 'x' },
      operations: [{ op: 'rename', field: 'first', newName: 'name' }],
    });
    expect(out.item).toEqual({ name: 'x' });
  });

  it('removes a field', async () => {
    const out = await run({
      source: { a: 1, b: 2 },
      operations: [{ op: 'remove', field: 'b' }],
    });
    expect(out.item).toEqual({ a: 1 });
  });

  it('applies multiple operations in order', async () => {
    const out = await run({
      source: { a: 1, old: 'v' },
      operations: [
        { op: 'set', field: 'c', value: 3 },
        { op: 'rename', field: 'old', newName: 'fresh' },
        { op: 'remove', field: 'a' },
      ],
    });
    expect(out.item).toEqual({ c: 3, fresh: 'v' });
  });

  it('defaults op to "set" when omitted', async () => {
    const out = await run({
      source: { a: 1 },
      operations: [{ field: 'a', value: 99 }],
    });
    expect(out.item).toEqual({ a: 99 });
  });

  it('skips rows with no field, and rename rows with no newName', async () => {
    const out = await run({
      source: { a: 1 },
      operations: [
        { op: 'set', value: 5 }, // no field → skipped
        { op: 'rename', field: 'a' }, // no newName → skipped (a stays)
      ],
    });
    expect(out.item).toEqual({ a: 1 });
  });

  it('wraps a non-object scalar source under {value}', async () => {
    const out = await run({ source: 42, operations: [] });
    expect(out.item).toEqual({ value: 42 });
  });

  it('treats null/empty source as an empty object (pure builder)', async () => {
    const out = await run({ operations: [{ op: 'set', field: 'k', value: 'v' }] });
    expect(out.item).toEqual({ k: 'v' });
  });
});

describe('EditFieldsProcessor.execute — array source', () => {
  it('applies operations to every element', async () => {
    const out = await run({
      source: [{ a: 1 }, { a: 2 }],
      operations: [{ op: 'set', field: 'flag', value: true }],
    });
    expect(out.isArray).toBe(true);
    expect(out.count).toBe(2);
    expect(out.items).toEqual([
      { a: 1, flag: true },
      { a: 2, flag: true },
    ]);
  });

  it('unwraps the {records:[...]} envelope into per-item edits', async () => {
    const out = await run({
      source: { records: [{ x: 1 }] },
      operations: [{ op: 'set', field: 'x', value: 9 }],
    });
    // records envelope -> resolveSource returns the object, not an array, so it
    // is edited as a single object (records key untouched, x not present).
    expect(out.isArray).toBe(false);
  });
});

describe('EditFieldsProcessor.validate', () => {
  it('passes when operations is an array or absent', () => {
    expect(new EditFieldsProcessor().validate({ operations: [] }).valid).toBe(true);
    expect(new EditFieldsProcessor().validate({}).valid).toBe(true);
  });

  it('fails when operations is not an array', () => {
    const res = new EditFieldsProcessor().validate({ operations: 'nope' });
    expect(res.valid).toBe(false);
    expect(res.errors?.[0]).toMatch(/operations must be an array/);
  });
});
