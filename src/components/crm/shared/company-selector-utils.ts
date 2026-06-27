export function normalizeCompanySearchTerm(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function canCreateCompanyFromSearch(
  search: string,
  companies: Array<{ name: string }>
): boolean {
  const normalizedSearch = normalizeCompanySearchTerm(search);

  if (!normalizedSearch) {
    return false;
  }

  const normalizedLower = normalizedSearch.toLowerCase();

  return !companies.some(
    (company) => normalizeCompanySearchTerm(company.name).toLowerCase() === normalizedLower
  );
}
