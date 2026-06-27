import { it, expect } from 'vitest';

import {
  applyCompanyViewFilters,
  buildCompanyViewFilters,
} from './company-view-filters';

it('applyCompanyViewFilters maps supported view filters onto company API filters', () => {
  const result = applyCompanyViewFilters(
    {
      page: 1,
      limit: 25,
      sort: '-createdAt',
    },
    [
      { field: 'type', operator: 'equals', value: 'customer', conjunction: 'and' },
      { field: 'industry', operator: 'contains', value: 'software', conjunction: 'and' },
      { field: 'size', operator: 'equals', value: '51-200', conjunction: 'and' },
      { field: 'name', operator: 'contains', value: 'Montr', conjunction: 'and' },
    ]
  );

  expect(result.type).toBe('customer');
  expect(result.industry).toBe('software');
  expect(result.size).toBe('51-200');
  expect(result.search).toBe('Montr');
});

it('applyCompanyViewFilters preserves explicit live filters over saved view filters', () => {
  const result = applyCompanyViewFilters(
    {
      search: 'Acme',
      type: 'partner',
    },
    [
      { field: 'type', operator: 'equals', value: 'customer', conjunction: 'and' },
      { field: 'name', operator: 'contains', value: 'Montr', conjunction: 'and' },
    ]
  );

  expect(result.type).toBe('partner');
  expect(result.search).toBe('Acme');
});

it('buildCompanyViewFilters serializes current live company filters into saveable view filters', () => {
  const filters = buildCompanyViewFilters({
    type: 'prospect',
    industry: 'technology',
    size: '11-50',
    search: 'Montr',
  });

  expect(filters).toEqual([
    { field: 'type', operator: 'equals', value: 'prospect', conjunction: 'and' },
    { field: 'industry', operator: 'contains', value: 'technology', conjunction: 'and' },
    { field: 'size', operator: 'equals', value: '11-50', conjunction: 'and' },
    { field: 'name', operator: 'contains', value: 'Montr', conjunction: 'and' },
  ]);
});
