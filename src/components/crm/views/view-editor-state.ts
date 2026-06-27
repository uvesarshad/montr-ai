import type { View, ViewEntityType, ViewFilter } from '@/types/crm';
import type { FilterTree, FilterRule } from '@/lib/crm/filter-query';

/**
 * Convert a legacy flat `filters` array into a single root group. The legacy
 * model carried a per-rule `conjunction`; we collapse it to one group logic by
 * taking the first non-default conjunction found (matching the old "all rules
 * share one connector" behavior in practice).
 */
export function legacyFiltersToTree(filters: ViewFilter[] = []): FilterTree {
  const logic =
    filters.find((f) => f.conjunction === 'or') ? 'or' : 'and';
  return {
    logic,
    rules: filters.map((f) => ({
      field: f.field,
      operator: f.operator,
      value: f.value,
    })) as FilterRule[],
    groups: [],
  };
}

/** Empty root group used for brand-new views with no filters. */
export function emptyFilterTree(): FilterTree {
  return { logic: 'and', rules: [], groups: [] };
}

const COLUMN_DEFINITIONS: Record<ViewEntityType, { value: string; label: string }[]> = {
  contact: [
    { value: 'firstName', label: 'First Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'jobTitle', label: 'Job Title' },
    { value: 'status', label: 'Status' },
    { value: 'lifecycle', label: 'Lifecycle' },
    { value: 'rating', label: 'Rating' },
    { value: 'score', label: 'Score' },
    { value: 'source', label: 'Source' },
    { value: 'tags', label: 'Tags' },
    { value: 'createdAt', label: 'Created Date' },
    { value: 'lastActivityAt', label: 'Last Activity' },
  ],
  company: [
    { value: 'name', label: 'Company Name' },
    { value: 'domain', label: 'Domain' },
    { value: 'industry', label: 'Industry' },
    { value: 'type', label: 'Type' },
    { value: 'size', label: 'Size' },
    { value: 'annualRevenue', label: 'Annual Revenue' },
    { value: 'employeeCount', label: 'Employees' },
    { value: 'contactCount', label: 'Contacts' },
    { value: 'dealCount', label: 'Deals' },
    { value: 'tags', label: 'Tags' },
    { value: 'createdAt', label: 'Created Date' },
  ],
  deal: [
    { value: 'name', label: 'Deal Name' },
    { value: 'value', label: 'Value' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'probability', label: 'Probability' },
    { value: 'expectedCloseDate', label: 'Expected Close' },
    { value: 'stageId', label: 'Stage' },
    { value: 'pipelineId', label: 'Pipeline' },
    { value: 'tags', label: 'Tags' },
    { value: 'createdAt', label: 'Created Date' },
  ],
  activity: [
    { value: 'type', label: 'Type' },
    { value: 'title', label: 'Title' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'dueDate', label: 'Due Date' },
    { value: 'targetType', label: 'Related To' },
    { value: 'createdAt', label: 'Created Date' },
  ],
};

export function getViewEditorColumns(entityType: ViewEntityType) {
  return COLUMN_DEFINITIONS[entityType] || [];
}

export function buildNewViewEditorState(
  entityType: ViewEntityType,
  initialFilters: ViewFilter[] = []
) {
  return {
    selectedColumns: getViewEditorColumns(entityType)
      .slice(0, 5)
      .map((column) => column.value),
    filters: initialFilters,
  };
}

export function buildViewEditorStateFromView(
  view: Pick<View, 'filters' | 'columns'>
) {
  return {
    selectedColumns: view.columns,
    filters: view.filters as ViewFilter[],
  };
}
