/**
 * CRM nested filter-group → Mongo query builder.
 *
 * Converts a `FilterTree` (recursive AND/OR groups of field conditions — the
 * Twenty `ViewFilterGroup` equivalent) into a Mongo `FilterQuery` fragment.
 *
 * SECURITY: this builder produces ONLY the user-driven portion of the query.
 * The caller (repository) is responsible for ALWAYS AND-ing the result with
 * the mandatory org/security scope (`{ organizationId, deletedAt: null }`)
 * OUTSIDE of any tree the user can influence. This module:
 *   - rejects field names not matching ^[a-zA-Z0-9_.]+$
 *   - rejects any field starting with `$` (operator injection)
 *   - regex-escapes values used in `contains` / `not_contains`
 */

import type { FilterOperator } from '@/lib/db/models/crm/view.model';

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface FilterTree {
  logic: 'and' | 'or';
  rules: FilterRule[];
  groups?: FilterTree[];
}

export type CrmEntityType = 'contact' | 'company' | 'deal' | 'activity';

const FIELD_NAME_RE = /^[a-zA-Z0-9_.]+$/;

/** Whitelisted, queryable fields per entity. Anything else is silently dropped. */
const ALLOWED_FIELDS: Record<CrmEntityType, ReadonlySet<string>> = {
  contact: new Set([
    'firstName', 'lastName', 'email', 'phone', 'jobTitle', 'department',
    'status', 'lifecycle', 'rating', 'score', 'source', 'companyId',
    'ownerId', 'tags', 'createdAt', 'lastActivityAt',
  ]),
  company: new Set([
    'name', 'domain', 'industry', 'type', 'size', 'annualRevenue',
    'employeeCount', 'ownerId', 'tags', 'createdAt',
  ]),
  deal: new Set([
    'name', 'value', 'status', 'priority', 'probability', 'expectedCloseDate',
    'stageId', 'pipelineId', 'ownerId', 'companyId', 'contactId', 'tags',
    'createdAt',
  ]),
  activity: new Set([
    'type', 'title', 'status', 'priority', 'dueDate', 'targetType',
    'createdAt',
  ]),
};

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFieldNameSafe(field: string): boolean {
  return (
    typeof field === 'string' &&
    field.length > 0 &&
    !field.startsWith('$') &&
    FIELD_NAME_RE.test(field)
  );
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [value];
}

/**
 * Convert a single rule to a Mongo condition `{ field: <expr> }`, or `null`
 * if the rule is invalid / incomplete and should be skipped.
 */
function ruleToCondition(rule: FilterRule): Record<string, unknown> | null {
  if (!rule || !isFieldNameSafe(rule.field)) return null;
  const { field, operator, value } = rule;

  const needsValue = !['is_empty', 'is_not_empty'].includes(operator);
  if (needsValue && (value === undefined || value === null || value === '')) {
    return null;
  }

  switch (operator) {
    case 'equals':
      return { [field]: value };
    case 'not_equals':
      return { [field]: { $ne: value } };
    case 'contains':
      return {
        [field]: { $regex: escapeRegex(String(value)), $options: 'i' },
      };
    case 'not_contains':
      return {
        [field]: {
          $not: { $regex: escapeRegex(String(value)), $options: 'i' },
        },
      };
    case 'gt':
      return { [field]: { $gt: value } };
    case 'gte':
      return { [field]: { $gte: value } };
    case 'lt':
      return { [field]: { $lt: value } };
    case 'lte':
      return { [field]: { $lte: value } };
    case 'is_empty':
      return { $or: [{ [field]: { $in: [null, ''] } }, { [field]: { $exists: false } }] };
    case 'is_not_empty':
      return { [field]: { $exists: true, $nin: [null, ''] } };
    case 'in': {
      const arr = toArray(value);
      return arr.length ? { [field]: { $in: arr } } : null;
    }
    case 'not_in': {
      const arr = toArray(value);
      return arr.length ? { [field]: { $nin: arr } } : null;
    }
    default:
      return null;
  }
}

/**
 * Convert a filter tree to a Mongo query fragment.
 *
 * Returns `null` when the tree contributes no constraints (empty / all rules
 * skipped) so the caller can omit it entirely.
 *
 * Depth is 0-indexed: root is depth 0 and the zod schema permits two further
 * nesting levels (depths 1 and 2) — 3 levels total. Deeper groups are dropped
 * defensively here too.
 */
export function filterTreeToMongo(
  tree: FilterTree | null | undefined,
  entityType: CrmEntityType,
  depth = 0,
): Record<string, unknown> | null {
  if (!tree || depth > 2) return null;

  const allowed = ALLOWED_FIELDS[entityType];
  const conditions: Record<string, unknown>[] = [];

  for (const rule of tree.rules ?? []) {
    if (allowed && !allowed.has(rule.field)) continue;
    const cond = ruleToCondition(rule);
    if (cond) conditions.push(cond);
  }

  for (const group of tree.groups ?? []) {
    const sub = filterTreeToMongo(group, entityType, depth + 1);
    if (sub) conditions.push(sub);
  }

  if (conditions.length === 0) return null;
  if (conditions.length === 1) return conditions[0];

  const op = tree.logic === 'or' ? '$or' : '$and';
  return { [op]: conditions };
}
