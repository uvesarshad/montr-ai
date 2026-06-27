
import { it, expect } from 'vitest';
import { isRouteActive } from '@/lib/navigation/route-match';

it('matches nested routes without query params', () => {
  expect(isRouteActive('/crm/contacts', new URLSearchParams(), '/crm')).toBe(true);
  expect(isRouteActive('/crm', new URLSearchParams(), '/crm')).toBe(true);
  expect(isRouteActive('/settings', new URLSearchParams(), '/crm')).toBe(false);
});

it('matches exact query-based settings routes', () => {
  expect(isRouteActive('/settings', new URLSearchParams('tab=crm'), '/settings?tab=crm', { exact: true })).toBe(true);
  expect(isRouteActive('/settings', new URLSearchParams('tab=general'), '/settings?tab=crm', { exact: true })).toBe(false);
});

it('requires matching query params for query-based routes', () => {
  expect(isRouteActive('/settings', new URLSearchParams(), '/settings?tab=crm')).toBe(false);
  expect(isRouteActive('/settings/profile', new URLSearchParams('tab=crm'), '/settings?tab=crm')).toBe(false);
});
