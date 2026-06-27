/**
 * Merge Processor (`merge` / `data_merge`)
 *
 * Combine TWO inputs. Dropdown-driven, no code.
 *
 * Config:
 *   - mode:     'append' | 'merge-by-key' | 'combine-fields'
 *       - append:         concatenate both arrays into one list.
 *       - merge-by-key:   match items from A and B on `key`; merged item = {...a, ...b}.
 *                         Items in A with no B match are kept as-is; B-only items
 *                         are appended.
 *       - combine-fields: shallow-merge the two inputs as single objects
 *                         ({...A, ...B}); arrays are wrapped to a single object first.
 *   - sourceA:  expression path to input A (node output ref, e.g. `$nodeA.records`).
 *   - sourceB:  expression path to input B.
 *   - key:      field name used by merge-by-key.
 *
 * Output (append / merge-by-key): `{ success, items, count }`.
 * Output (combine-fields):        `{ success, item, count: 1 }`.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveSource, toItemArray, assertWithinCap, getPath } from './transform-helpers';

type MergeMode = 'append' | 'merge-by-key' | 'combine-fields';

function asObject(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return value != null ? { value } : {};
}

export class MergeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const mode = String(config.mode || 'append') as MergeMode;
    const a = resolveSource(context, config.sourceA);
    const b = resolveSource(context, config.sourceB);

    if (mode === 'combine-fields') {
      const item = { ...asObject(a), ...asObject(b) };
      return { success: true, item, count: 1 };
    }

    const arrA = toItemArray(a);
    const arrB = toItemArray(b);
    assertWithinCap(arrA.length + arrB.length, 'records');

    if (mode === 'append') {
      const items = [...arrA, ...arrB];
      return { success: true, items, count: items.length };
    }

    // merge-by-key
    const key = String(config.key || '').trim();
    if (!key) {
      throw new Error('Merge mode "merge-by-key" requires a key field.');
    }
    const keyOf = (item: unknown) => {
      const v = getPath(item, key);
      return v == null ? undefined : typeof v === 'object' ? JSON.stringify(v) : String(v);
    };

    const bByKey = new Map<string, unknown>();
    for (const item of arrB) {
      const k = keyOf(item);
      if (k !== undefined) bByKey.set(k, item);
    }

    const usedFromB = new Set<string>();
    const items: unknown[] = arrA.map((item) => {
      const k = keyOf(item);
      if (k !== undefined && bByKey.has(k)) {
        usedFromB.add(k);
        return { ...asObject(item), ...asObject(bByKey.get(k)) };
      }
      return item;
    });
    // Append B-only items.
    for (const item of arrB) {
      const k = keyOf(item);
      if (k === undefined || !usedFromB.has(k)) items.push(item);
    }

    return { success: true, items, count: items.length };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const mode = String(config.mode || 'append');
    if (!['append', 'merge-by-key', 'combine-fields'].includes(mode)) {
      errors.push('mode must be append, merge-by-key, or combine-fields');
    }
    if (mode === 'merge-by-key' && !String(config.key || '').trim()) {
      errors.push('merge-by-key requires a key field');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
