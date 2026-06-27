import { ContactFilters } from '@/hooks/crm/use-contacts';
import { ViewFilter } from '@/types/crm';
import { CreateViewInput } from '@/validations/crm/view.schema';

function getFilterValue(filter: ViewFilter) {
  if (Array.isArray(filter.value)) {
    return filter.value[0];
  }

  return typeof filter.value === 'string' ? filter.value : undefined;
}

export function applyContactViewFilters(
  baseFilters: ContactFilters,
  viewFilters: ViewFilter[]
): ContactFilters {
  const result: ContactFilters = { ...baseFilters };

  for (const filter of viewFilters) {
    const value = getFilterValue(filter);

    if (!value) {
      continue;
    }

    if (filter.field === 'status' && !result.status && filter.operator === 'equals') {
      result.status = value;
    }

    if (filter.field === 'lifecycle' && !result.lifecycle && filter.operator === 'equals') {
      result.lifecycle = value;
    }

    if (filter.field === 'rating' && !result.rating && filter.operator === 'equals') {
      result.rating = value;
    }

    if (filter.field === 'source' && !result.source && filter.operator === 'equals') {
      result.source = value;
    }

    if (
      ['firstName', 'lastName', 'email', 'phone', 'jobTitle'].includes(filter.field) &&
      !result.search &&
      filter.operator === 'contains'
    ) {
      result.search = value;
    }
  }

  return result;
}

export function buildContactViewFilters(input: {
  status?: string;
  lifecycle?: string;
  rating?: string;
  search?: string;
}): CreateViewInput['filters'] {
  const filters: CreateViewInput['filters'] = [];

  if (input.status) {
    filters.push({
      field: 'status',
      operator: 'equals',
      value: input.status,
      conjunction: 'and',
    });
  }

  if (input.lifecycle) {
    filters.push({
      field: 'lifecycle',
      operator: 'equals',
      value: input.lifecycle,
      conjunction: 'and',
    });
  }

  if (input.rating) {
    filters.push({
      field: 'rating',
      operator: 'equals',
      value: input.rating,
      conjunction: 'and',
    });
  }

  if (input.search) {
    filters.push({
      field: 'email',
      operator: 'contains',
      value: input.search,
      conjunction: 'and',
    });
  }

  return filters;
}
