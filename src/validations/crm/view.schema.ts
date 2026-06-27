import { z } from 'zod';

// Filter operators
export const filterOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_empty',
  'is_not_empty',
  'in',
  'not_in',
]);

// View filter schema
export const viewFilterSchema = z.object({
  field: z.string().min(1),
  operator: filterOperatorSchema,
  value: z.any(),
  conjunction: z.enum(['and', 'or']).default('and'),
});

// --- Nested filter groups (Twenty ViewFilterGroup equivalent) ---
// A single rule inside a group. `conjunction` is intentionally omitted here —
// boolean logic lives on the group's `logic`, not per-rule.
export const filterRuleSchema = z.object({
  field: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Invalid field name')
    .refine((f) => !f.startsWith('$'), 'Field name may not start with $'),
  operator: filterOperatorSchema,
  value: z.any().optional(),
});

// Explicit 3-level nesting (depth cap enforced structurally rather than z.lazy).
// Level 3 (deepest): rules only, no further groups.
const filterTreeL3 = z.object({
  logic: z.enum(['and', 'or']).default('and'),
  rules: z.array(filterRuleSchema).default([]),
  groups: z.array(z.never()).default([]).optional(),
});

const filterTreeL2 = z.object({
  logic: z.enum(['and', 'or']).default('and'),
  rules: z.array(filterRuleSchema).default([]),
  groups: z.array(filterTreeL3).max(20).default([]).optional(),
});

// Root group (depth 1).
export const filterTreeSchema = z.object({
  logic: z.enum(['and', 'or']).default('and'),
  rules: z.array(filterRuleSchema).default([]),
  groups: z.array(filterTreeL2).max(20).default([]).optional(),
});

// View sort schema
export const viewSortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

// Create view schema
export const createViewSchema = z.object({
  name: z.string().min(1, 'View name is required').max(200),
  entityType: z.enum(['contact', 'company', 'deal', 'activity']),
  icon: z.string().max(50).optional(),
  color: z.string().max(50).optional(),
  filters: z.array(viewFilterSchema).default([]),
  // Nested AND/OR filter groups. When present, this wins over `filters` at
  // query time; `filters` is retained untouched for legacy back-compat.
  filterTree: filterTreeSchema.optional(),
  sort: viewSortSchema.optional(),
  columns: z.array(z.string()).default([]),
  columnWidths: z.record(z.number()).default({}),
  groupBy: z.string().optional(),
  visibility: z.enum(['private', 'team', 'organization']).default('private'),
  sharedWith: z.array(z.string()).default([]),
  order: z.number().default(0),
  isPinned: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  openRecordIn: z.enum(['panel', 'page']).default('panel'),
});

// Update view schema (all fields optional)
export const updateViewSchema = createViewSchema.partial();

// View filter input schema
export const viewListFilterSchema = z.object({
  entityType: z.enum(['contact', 'company', 'deal', 'activity']).optional(),
  visibility: z.enum(['private', 'team', 'organization']).optional(),
  ownerId: z.string().optional(),
  isPinned: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('order'),
});

// Share view schema
export const shareViewSchema = z.object({
  visibility: z.enum(['private', 'team', 'organization']),
  sharedWith: z.array(z.string()).optional(),
});

// Type exports
export type FilterOperator = z.infer<typeof filterOperatorSchema>;
export type ViewFilterInput = z.infer<typeof viewFilterSchema>;
export type FilterRuleInput = z.infer<typeof filterRuleSchema>;
export type FilterTreeInput = z.infer<typeof filterTreeSchema>;
export type ViewSortInput = z.infer<typeof viewSortSchema>;
export type CreateViewInput = z.infer<typeof createViewSchema>;
export type UpdateViewInput = z.infer<typeof updateViewSchema>;
export type ViewListFilterInput = z.infer<typeof viewListFilterSchema>;
export type ShareViewInput = z.infer<typeof shareViewSchema>;
