import { it, expect } from 'vitest';

import { canCreateCompanyFromSearch, normalizeCompanySearchTerm } from './company-selector-utils';

it('normalizeCompanySearchTerm trims and collapses whitespace', () => {
  expect(normalizeCompanySearchTerm('  Acme   Inc  ')).toBe('Acme Inc');
  expect(normalizeCompanySearchTerm('')).toBe('');
});

it('canCreateCompanyFromSearch requires a non-empty search term', () => {
  expect(canCreateCompanyFromSearch('', [])).toBe(false);
  expect(canCreateCompanyFromSearch('   ', [])).toBe(false);
});

it('canCreateCompanyFromSearch hides create action for exact existing matches', () => {
  expect(canCreateCompanyFromSearch('acme inc', [{ name: 'Acme Inc' }])).toBe(false);
});

it('canCreateCompanyFromSearch shows create action for a new company name', () => {
  expect(canCreateCompanyFromSearch('Northwind Labs', [{ name: 'Acme Inc' }])).toBe(true);
});
