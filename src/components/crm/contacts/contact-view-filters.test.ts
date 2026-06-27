import { it, expect } from 'vitest';

import {
  applyContactViewFilters,
  buildContactViewFilters,
} from './contact-view-filters';

it('applyContactViewFilters maps supported view filters onto contact API filters', () => {
  const result = applyContactViewFilters(
    {
      page: 1,
      limit: 25,
      sort: '-createdAt',
    },
    [
      { field: 'status', operator: 'equals', value: 'lead', conjunction: 'and' },
      { field: 'lifecycle', operator: 'equals', value: 'sql', conjunction: 'and' },
      { field: 'rating', operator: 'equals', value: 'hot', conjunction: 'and' },
      { field: 'source', operator: 'equals', value: 'website', conjunction: 'and' },
      { field: 'email', operator: 'contains', value: 'montr.ai', conjunction: 'and' },
    ]
  );

  expect(result.status).toBe('lead');
  expect(result.lifecycle).toBe('sql');
  expect(result.rating).toBe('hot');
  expect(result.source).toBe('website');
  expect(result.search).toBe('montr.ai');
});

it('applyContactViewFilters preserves explicit live filters over saved view filters', () => {
  const result = applyContactViewFilters(
    {
      search: 'ava',
      status: 'customer',
      page: 2,
    },
    [
      { field: 'status', operator: 'equals', value: 'lead', conjunction: 'and' },
      { field: 'email', operator: 'contains', value: 'montr.ai', conjunction: 'and' },
    ]
  );

  expect(result.status).toBe('customer');
  expect(result.search).toBe('ava');
  expect(result.page).toBe(2);
});

it('buildContactViewFilters serializes the current live contact filters into saveable view filters', () => {
  const filters = buildContactViewFilters({
    status: 'lead',
    lifecycle: 'mql',
    rating: 'warm',
    search: 'ava',
  });

  expect(filters).toEqual([
    { field: 'status', operator: 'equals', value: 'lead', conjunction: 'and' },
    { field: 'lifecycle', operator: 'equals', value: 'mql', conjunction: 'and' },
    { field: 'rating', operator: 'equals', value: 'warm', conjunction: 'and' },
    { field: 'email', operator: 'contains', value: 'ava', conjunction: 'and' },
  ]);
});
