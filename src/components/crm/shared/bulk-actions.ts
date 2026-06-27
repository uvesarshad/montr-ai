async function bulkDelete(
  url: string,
  ids: string[],
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Bulk delete failed');
  }

  const result = await response.json();
  return result.deletedCount ?? 0;
}

export function bulkDeleteContacts(
  ids: string[],
  fetcher?: typeof fetch
) {
  return bulkDelete('/api/v2/crm/contacts/bulk/delete', ids, fetcher);
}

export function bulkDeleteCompanies(
  ids: string[],
  fetcher?: typeof fetch
) {
  return bulkDelete('/api/v2/crm/companies/bulk/delete', ids, fetcher);
}
