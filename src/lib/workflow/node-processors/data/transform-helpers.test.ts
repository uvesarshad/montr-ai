import { describe, it, expect } from 'vitest';
import {
  MAX_ITEMS,
  resolveSource,
  toItemArray,
  assertWithinCap,
  getPath,
  setPath,
  removePath,
  compareValues,
} from './transform-helpers';
import type { NodeProcessorContext } from '../index';

// A minimal context that only exposes the one method resolveSource touches.
function ctxWith(evaluate: (expr: string) => unknown): NodeProcessorContext {
  return {
    variableResolver: { evaluateExpression: evaluate },
  } as unknown as NodeProcessorContext;
}

describe('resolveSource', () => {
  it('returns undefined for null / undefined / empty / whitespace', () => {
    const ctx = ctxWith(() => 'should-not-be-called');
    expect(resolveSource(ctx, null)).toBeUndefined();
    expect(resolveSource(ctx, undefined)).toBeUndefined();
    expect(resolveSource(ctx, '')).toBeUndefined();
    expect(resolveSource(ctx, '   ')).toBeUndefined();
  });

  it('passes through non-string (already materialized) values without calling the resolver', () => {
    let called = false;
    const ctx = ctxWith(() => {
      called = true;
      return null;
    });
    const arr = [1, 2, 3];
    expect(resolveSource(ctx, arr)).toBe(arr);
    expect(resolveSource(ctx, 42)).toBe(42);
    expect(called).toBe(false);
  });

  it('evaluates a trimmed expression string through the resolver', () => {
    const ctx = ctxWith((expr) => `resolved:${expr}`);
    expect(resolveSource(ctx, '  variables.items  ')).toBe('resolved:variables.items');
  });

  it('strips a single wrapping {{ }} interpolation form before resolving', () => {
    const ctx = ctxWith((expr) => expr);
    expect(resolveSource(ctx, '{{ $findNode.records }}')).toBe('$findNode.records');
    expect(resolveSource(ctx, '{{trigger.payload}}')).toBe('trigger.payload');
  });
});

describe('toItemArray', () => {
  it('returns [] for null / undefined', () => {
    expect(toItemArray(null)).toEqual([]);
    expect(toItemArray(undefined)).toEqual([]);
  });

  it('returns arrays unchanged', () => {
    const a = [1, 2];
    expect(toItemArray(a)).toBe(a);
  });

  it('unwraps records / items / data envelopes', () => {
    expect(toItemArray({ records: [1, 2] })).toEqual([1, 2]);
    expect(toItemArray({ items: ['a'] })).toEqual(['a']);
    expect(toItemArray({ data: [true] })).toEqual([true]);
  });

  it('prefers records over items over data', () => {
    expect(toItemArray({ records: ['r'], items: ['i'], data: ['d'] })).toEqual(['r']);
    expect(toItemArray({ items: ['i'], data: ['d'] })).toEqual(['i']);
  });

  it('wraps a plain object (no known envelope) as a single element', () => {
    const obj = { foo: 'bar' };
    expect(toItemArray(obj)).toEqual([obj]);
  });

  it('wraps a scalar as a single element', () => {
    expect(toItemArray('hello')).toEqual(['hello']);
    expect(toItemArray(7)).toEqual([7]);
  });
});

describe('assertWithinCap', () => {
  it('does nothing at or below the cap', () => {
    expect(() => assertWithinCap(0)).not.toThrow();
    expect(() => assertWithinCap(MAX_ITEMS)).not.toThrow();
  });

  it('throws above the cap and includes the label + cap in the message', () => {
    expect(() => assertWithinCap(MAX_ITEMS + 1, 'records')).toThrow(/records/);
    expect(() => assertWithinCap(MAX_ITEMS + 1)).toThrow(String(MAX_ITEMS));
  });
});

describe('getPath', () => {
  it('returns the object itself for an empty path', () => {
    const o = { a: 1 };
    expect(getPath(o, '')).toBe(o);
  });

  it('reads a nested dotted path', () => {
    expect(getPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('trims whitespace and skips empty segments', () => {
    expect(getPath({ a: { b: 1 } }, ' a . b ')).toBe(1);
  });

  it('returns undefined when a segment is missing or not an object', () => {
    expect(getPath({ a: 1 }, 'a.b')).toBeUndefined();
    expect(getPath({ a: { b: 1 } }, 'a.x.y')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
  });
});

describe('setPath', () => {
  it('sets a top-level key immutably', () => {
    const src = { a: 1 };
    const out = setPath(src, 'b', 2);
    expect(out).toEqual({ a: 1, b: 2 });
    expect(src).toEqual({ a: 1 }); // original untouched
    expect(out).not.toBe(src);
  });

  it('sets a nested path, creating intermediate objects', () => {
    const out = setPath({} as Record<string, unknown>, 'a.b.c', 5);
    expect(out).toEqual({ a: { b: { c: 5 } } });
  });

  it('does not mutate nested source objects', () => {
    const src = { a: { b: 1 } };
    const out = setPath(src, 'a.c', 2);
    expect(out).toEqual({ a: { b: 1, c: 2 } });
    expect(src).toEqual({ a: { b: 1 } });
    expect(out.a).not.toBe(src.a);
  });

  it('returns the object unchanged for an empty path', () => {
    const src = { a: 1 };
    expect(setPath(src, '', 9)).toBe(src);
  });
});

describe('removePath', () => {
  it('removes a top-level key immutably', () => {
    const src = { a: 1, b: 2 };
    const out = removePath(src, 'b');
    expect(out).toEqual({ a: 1 });
    expect(src).toEqual({ a: 1, b: 2 });
  });

  it('removes a nested key without mutating the source', () => {
    const src = { a: { b: 1, c: 2 } };
    const out = removePath(src, 'a.c');
    expect(out).toEqual({ a: { b: 1 } });
    expect(src).toEqual({ a: { b: 1, c: 2 } });
  });

  it('is a no-op clone when an intermediate segment is missing', () => {
    const src = { a: 1 };
    const out = removePath(src, 'x.y');
    expect(out).toEqual({ a: 1 });
    expect(out).not.toBe(src);
  });

  it('returns the object unchanged for an empty path', () => {
    const src = { a: 1 };
    expect(removePath(src, '')).toBe(src);
  });
});

describe('compareValues', () => {
  it('compares numbers numerically', () => {
    expect(compareValues(2, 10, 'number')).toBe(-1);
    expect(compareValues(10, 2, 'number')).toBe(1);
    expect(compareValues(5, 5, 'number')).toBe(0);
  });

  it('treats non-finite numbers as -Infinity', () => {
    expect(compareValues('not-a-number', 0, 'number')).toBe(-1);
    expect(compareValues(null, null, 'number')).toBe(0);
  });

  it('compares dates chronologically', () => {
    expect(compareValues('2020-01-01', '2021-01-01', 'date')).toBe(-1);
    expect(compareValues('2021-01-01', '2020-01-01', 'date')).toBe(1);
    expect(compareValues('2020-01-01', '2020-01-01', 'date')).toBe(0);
  });

  it('compares strings lexicographically and coerces nullish to empty string', () => {
    expect(compareValues('apple', 'banana', 'string')).toBeLessThan(0);
    expect(compareValues('banana', 'apple', 'string')).toBeGreaterThan(0);
    expect(compareValues(null, '', 'string')).toBe(0);
  });
});
