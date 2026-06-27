/**
 * Sort Processor (`sort` / `data_sort`)
 *
 * Sort an input array by a field with type coercion. Dropdown-driven, no code.
 *
 * Config:
 *   - source:     expression path to the input array (e.g. `$findNode.records`).
 *   - field:      dotted field to sort by. Empty = sort by the item itself.
 *   - direction:  'asc' | 'desc' (default asc).
 *   - type:       'string' | 'number' | 'date' coercion (default string).
 *
 * Output: `{ success, items, count }`.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import {
  resolveSource,
  toItemArray,
  assertWithinCap,
  getPath,
  compareValues,
} from './transform-helpers';

export class SortProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const items = toItemArray(resolveSource(context, config.source));
    assertWithinCap(items.length, 'records');

    const field = String(config.field || '').trim();
    const direction = String(config.direction || 'asc') === 'desc' ? -1 : 1;
    const type = (['string', 'number', 'date'].includes(String(config.type))
      ? String(config.type)
      : 'string') as 'string' | 'number' | 'date';

    const valueOf = (item: unknown) => (field ? getPath(item, field) : item);

    const sorted = [...items].sort((a, b) => direction * compareValues(valueOf(a), valueOf(b), type));

    return { success: true, items: sorted, count: sorted.length };
  }
}
