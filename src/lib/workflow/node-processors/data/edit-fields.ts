/**
 * Edit Fields Processor (`edit_fields` / `data_edit_fields`)
 *
 * Multi-field set / rename / remove on an input object — or, when the input is
 * an array of objects, applied to every element. Dropdown-driven, no code.
 *
 * Config:
 *   - source:     expression path to the input object or array (e.g.
 *                 `$findNode.records`, `trigger.payload`). Empty = operate on
 *                 an empty object (pure "set" builder).
 *   - operations: Array<{ op: 'set'|'rename'|'remove', field, value?, newName? }>
 *                 - set:    write `value` (already `{{}}`-interpolated by the
 *                           engine) to dotted `field`.
 *                 - rename: move `field` to `newName` (dotted; removes the old).
 *                 - remove: delete dotted `field`.
 *
 * Output: `{ success, item|items, isArray, count }`.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import {
  resolveSource,
  assertWithinCap,
  getPath,
  setPath,
  removePath,
} from './transform-helpers';

type EditOp = 'set' | 'rename' | 'remove';

interface OperationRow {
  op?: EditOp;
  field?: string;
  value?: unknown;
  newName?: string;
}

function applyOperations(input: unknown, ops: OperationRow[]): Record<string, unknown> {
  let obj: Record<string, unknown> =
    input != null && typeof input === 'object' && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : input != null
        ? { value: input }
        : {};

  for (const row of ops) {
    const field = row.field ? String(row.field).trim() : '';
    const op = (row.op || 'set') as EditOp;
    if (!field) continue;
    if (op === 'set') {
      obj = setPath(obj, field, row.value);
    } else if (op === 'remove') {
      obj = removePath(obj, field);
    } else if (op === 'rename') {
      const newName = row.newName ? String(row.newName).trim() : '';
      if (!newName) continue;
      const existing = getPath(obj, field);
      obj = setPath(obj, newName, existing);
      obj = removePath(obj, field);
    }
  }

  return obj;
}

export class EditFieldsProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const ops = Array.isArray(config.operations) ? (config.operations as OperationRow[]) : [];

    const source = resolveSource(context, config.source);

    if (Array.isArray(source)) {
      assertWithinCap(source.length, 'records');
      const items = source.map((el) => applyOperations(el, ops));
      return { success: true, isArray: true, items, count: items.length };
    }

    const item = applyOperations(source, ops);
    return { success: true, isArray: false, item, count: 1 };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (config.operations != null && !Array.isArray(config.operations)) {
      errors.push('operations must be an array of { op, field, value?, newName? } rows');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
