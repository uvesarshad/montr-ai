import { CompanyFilters } from '@/hooks/crm/use-companies';
import { ViewFilter } from '@/types/crm';
import { CreateViewInput } from '@/validations/crm/view.schema';

function getFilterValue(filter: ViewFilter) {
  if (Array.isArray(filter.value)) {
    return filter.value[0];
  }

  return typeof filter.value === 'string' ? filter.value : undefined;
}

export function applyCompanyViewFilters(
  baseFilters: CompanyFilters,
  viewFilters: ViewFilter[]
): CompanyFilters {
  const result: CompanyFilters = { ...baseFilters };

  for (const filter of viewFilters) {
    const value = getFilterValue(filter);

    if (!value) {
      continue;
    }

    if (filter.field === 'type' && !result.type && filter.operator === 'equals') {
      result.type = value;
    }

    if (filter.field === 'size' && !result.size && filter.operator === 'equals') {
      result.size = value;
    }

    if (filter.field === 'industry' && !result.industry && ['equals', 'contains'].includes(filter.operator)) {
      result.industry = value;
    }

    if (
      ['name', 'domain', 'website'].includes(filter.field) &&
      !result.search &&
      filter.operator === 'contains'
    ) {
      result.search = value;
    }
  }

  return result;
}

export function buildCompanyViewFilters(input: {
  type?: string;
  industry?: string;
  size?: string;
  search?: string;
}): CreateViewInput['filters'] {
  const filters: CreateViewInput['filters'] = [];

  if (input.type) {
    filters.push({
      field: 'type',
      operator: 'equals',
      value: input.type,
      conjunction: 'and',
    });
  }

  if (input.industry) {
    filters.push({
      field: 'industry',
      operator: 'contains',
      value: input.industry,
      conjunction: 'and',
    });
  }

  if (input.size) {
    filters.push({
      field: 'size',
      operator: 'equals',
      value: input.size,
      conjunction: 'and',
    });
  }

  if (input.search) {
    filters.push({
      field: 'name',
      operator: 'contains',
      value: input.search,
      conjunction: 'and',
    });
  }

  return filters;
}
