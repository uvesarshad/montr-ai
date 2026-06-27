/**
 * Shared helpers for the dropdown-driven data-transform node set (H7 / TODO 2.2).
 *
 * These nodes are PURE data operations — no outbound calls, no eval, no DB.
 * Org-scoping is N/A (they only reshape values already in the run context).
 *
 * Two conventions the whole set follows:
 *
 *  1. "Source path" config fields hold an EXPRESSION STRING (e.g.
 *     `$findNode.records`, `variables.items`, `trigger.payload`). The execution
 *     engine's `resolveObject` only does `{{}}` string interpolation (and
 *     String()-ifies the result), which would corrupt arrays/objects — so the
 *     processor resolves source paths itself via
 *     `context.variableResolver.evaluateExpression(path)` to get the real value.
 *
 *  2. Input arrays accept the `{records:[...]}` / `{items:[...]}` envelope shapes
 *     (from `find_records` etc.) as well as a bare array — `toItemArray` unwraps.
 */

import type { NodeProcessorContext } from '../index';

/** Hard cap on the number of items any transform node will process. */
export const MAX_ITEMS = 5000;

/**
 * Resolve a "source path" config value into its real runtime value.
 *
 * Accepts either an expression string (resolved through the variable resolver)
 * or an already-materialized value (when an upstream step injected one directly,
 * or in unit tests). Empty / missing → undefined.
 */
export function resolveSource(context: NodeProcessorContext, raw: unknown): unknown {
  if (raw == null) return undefined;
  if (typeof raw !== 'string') return raw; // already a value (array/object/etc.)
  const expr = raw.trim();
  if (!expr) return undefined;
  // Strip a single wrapping {{ }} if the user pasted an interpolation form.
  const unwrapped = expr.replace(/^\{\{\s*([\s\S]+?)\s*\}\}$/, '$1');
  return context.variableResolver.evaluateExpression(unwrapped);
}

/**
 * Coerce a resolved value into an array of items, unwrapping the common
 * `{records:[...]}` / `{items:[...]}` / `{data:[...]}` envelopes. A single
 * object becomes a one-element array; null/undefined → empty array.
 */
export function toItemArray(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.records)) return obj.records as unknown[];
    if (Array.isArray(obj.items)) return obj.items as unknown[];
    if (Array.isArray(obj.data)) return obj.data as unknown[];
    return [value];
  }
  return [value];
}

/** Throw a clear error when an array exceeds the processing cap. */
export function assertWithinCap(count: number, label = 'items'): void {
  if (count > MAX_ITEMS) {
    throw new Error(
      `Too many ${label} to process (${count}); the transform node caps at ${MAX_ITEMS}. ` +
        `Reduce the upstream result set (e.g. lower the Find Records limit).`
    );
  }
}

/** Read a dotted path out of a plain object: getPath({a:{b:1}}, 'a.b') => 1. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
  let cur: unknown = obj;
  for (const key of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Immutably set a dotted path on a (shallow-cloned) object. */
export function setPath<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return obj;
  const clone: Record<string, unknown> = { ...obj };
  let cur = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    cur[key] = next != null && typeof next === 'object' && !Array.isArray(next) ? { ...(next as object) } : {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return clone as T;
}

/** Immutably remove a dotted path from a (shallow-cloned) object. */
export function removePath<T extends Record<string, unknown>>(obj: T, path: string): T {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return obj;
  const clone: Record<string, unknown> = { ...obj };
  let cur = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next == null || typeof next !== 'object') return clone as T; // nothing to remove
    cur[key] = { ...(next as object) };
    cur = cur[key] as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]];
  return clone as T;
}

/** Compare two values for sort/aggregate with a coercion mode. */
export function compareValues(
  a: unknown,
  b: unknown,
  type: 'string' | 'number' | 'date'
): number {
  if (type === 'number') {
    const na = Number(a);
    const nb = Number(b);
    const va = Number.isFinite(na) ? na : Number.NEGATIVE_INFINITY;
    const vb = Number.isFinite(nb) ? nb : Number.NEGATIVE_INFINITY;
    return va === vb ? 0 : va < vb ? -1 : 1;
  }
  if (type === 'date') {
    const da = a == null ? NaN : new Date(a as string | number | Date).getTime();
    const db = b == null ? NaN : new Date(b as string | number | Date).getTime();
    const va = Number.isFinite(da) ? da : Number.NEGATIVE_INFINITY;
    const vb = Number.isFinite(db) ? db : Number.NEGATIVE_INFINITY;
    return va === vb ? 0 : va < vb ? -1 : 1;
  }
  const sa = a == null ? '' : String(a);
  const sb = b == null ? '' : String(b);
  return sa.localeCompare(sb);
}
