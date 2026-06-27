import { it, expect } from 'vitest';

import {
  bulkDeleteCompanies,
  bulkDeleteContacts,
} from './bulk-actions';

it('bulkDeleteContacts posts selected ids to the CRM bulk delete endpoint', async () => {
  let calledUrl = '';
  let calledMethod = '';
  let calledBody = '';

  const fetcher: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledMethod = init?.method ?? 'GET';
    calledBody = String(init?.body ?? '');

    return new Response(JSON.stringify({ deletedCount: 2 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const deletedCount = await bulkDeleteContacts(['c1', 'c2'], fetcher);

  expect(calledUrl).toBe('/api/v2/crm/contacts/bulk/delete');
  expect(calledMethod).toBe('POST');
  expect(JSON.parse(calledBody)).toEqual({ ids: ['c1', 'c2'] });
  expect(deletedCount).toBe(2);
});

it('bulkDeleteCompanies posts selected ids to the CRM bulk delete endpoint', async () => {
  let calledUrl = '';
  let calledMethod = '';
  let calledBody = '';

  const fetcher: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledMethod = init?.method ?? 'GET';
    calledBody = String(init?.body ?? '');

    return new Response(JSON.stringify({ deletedCount: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const deletedCount = await bulkDeleteCompanies(['a', 'b', 'c'], fetcher);

  expect(calledUrl).toBe('/api/v2/crm/companies/bulk/delete');
  expect(calledMethod).toBe('POST');
  expect(JSON.parse(calledBody)).toEqual({ ids: ['a', 'b', 'c'] });
  expect(deletedCount).toBe(3);
});
