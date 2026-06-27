/**
 * Find Records Processor (`find_records`)
 *
 * The "find many" counterpart to `find-record.ts`. Looks up a LIST of CRM
 * records (contact | company | deal) matching a filter set, so downstream
 * nodes can fan out over them via the engine's "Run once per item" toggle
 * (see `forEach` handling in `unified-execution-engine.ts`).
 *
 * Config:
 *   - entityType: 'contact' | 'company' | 'deal'
 *   - filters:    Array<{ field, operator, value }> — AND-ed together.
 *                 operators: equals | not_equals | contains | greater_than |
 *                            less_than | is_set | is_empty
 *   - tag:        optional tag id (or comma-separated ids) — matches the
 *                 record's `tags` array.
 *   - limit:      default 100, hard-capped at 500 by the repository.
 *   - sortField / sortDirection: optional ('createdAt' desc by default).
 *
 * Filter values are already variable-interpolated by the execution engine
 * before they reach the processor (same contract as every other node).
 *
 * Output: `{ success, entityType, records, count }`. `records` is the array
 * the per-item loop iterates over.
 */

import { Types } from 'mongoose';
import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { companyRepository } from '../../../db/repository/crm/company.repository';
import { dealRepository } from '../../../db/repository/crm/deal.repository';

type EntityType = 'contact' | 'company' | 'deal';

type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_set'
  | 'is_empty';

interface FilterRow {
  field?: string;
  operator?: FilterOperator;
  value?: unknown;
}

const HARD_CAP = 500;

/** Build a single Mongo condition for one filter row. */
function buildCondition(row: FilterRow): Record<string, unknown> | null {
  const field = row.field ? String(row.field).trim() : '';
  if (!field) return null;
  const operator = (row.operator || 'equals') as FilterOperator;
  const value = row.value;

  switch (operator) {
    case 'equals':
      return { [field]: value };
    case 'not_equals':
      return { [field]: { $ne: value } };
    case 'contains':
      // Case-insensitive substring match on string fields.
      return {
        [field]: {
          $regex: String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        },
      };
    case 'greater_than':
      return { [field]: { $gt: coerceNumeric(value) } };
    case 'less_than':
      return { [field]: { $lt: coerceNumeric(value) } };
    case 'is_set':
      return { [field]: { $nin: [null, ''], $exists: true } };
    case 'is_empty':
      return { $or: [{ [field]: { $in: [null, ''] } }, { [field]: { $exists: false } }] };
    default:
      return { [field]: value };
  }
}

/** Numeric comparators should compare numerically when the value looks numeric. */
function coerceNumeric(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

export class FindRecordsProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const entityType = String(config.entityType || 'contact') as EntityType;
    // Build the AND-ed query from filter rows.
    const rawFilters = Array.isArray(config.filters) ? (config.filters as FilterRow[]) : [];
    const conditions: Record<string, unknown>[] = [];
    for (const row of rawFilters) {
      const cond = buildCondition(row);
      if (cond) conditions.push(cond);
    }

    // Tag filter — accepts a single id or comma-separated ids.
    const tagRaw = config.tag != null ? String(config.tag).trim() : '';
    if (tagRaw) {
      const tagIds = tagRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t && Types.ObjectId.isValid(t))
        .map((t) => new Types.ObjectId(t));
      if (tagIds.length > 0) {
        conditions.push({ tags: { $in: tagIds } });
      }
    }

    const query: Record<string, unknown> = conditions.length > 0 ? { $and: conditions } : {};

    // Limit — default 100, hard cap 500 (also enforced in the repository).
    let limit = Number(config.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    limit = Math.min(limit, HARD_CAP);

    // Sort.
    const sortField = config.sortField ? String(config.sortField) : 'createdAt';
    const sortDirection = String(config.sortDirection || 'desc') === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDirection as 1 | -1 };

    let records: unknown[];
    if (entityType === 'contact') {
      records = await contactRepository.findManyForAutomation(query, { sort, limit });
    } else if (entityType === 'company') {
      records = await companyRepository.findManyForAutomation(query, { sort, limit });
    } else if (entityType === 'deal') {
      records = await dealRepository.findManyForAutomation(query, { sort, limit });
    } else {
      throw new Error(`Unsupported entityType: ${entityType}`);
    }

    return {
      success: true,
      entityType,
      records,
      count: records.length,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.entityType || !['contact', 'company', 'deal'].includes(String(config.entityType))) {
      errors.push('entityType must be contact, company, or deal');
    }
    if (config.filters != null && !Array.isArray(config.filters)) {
      errors.push('filters must be an array of { field, operator, value } rows');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
