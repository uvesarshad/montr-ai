import type { FavoriteFilters } from './use-favorites';
import type { ViewFilters } from './use-views';

export function buildFavoriteQueryString(filters?: FavoriteFilters): string {
  const params = new URLSearchParams();

  if (filters?.targetType) params.append('targetType', filters.targetType);
  if (filters?.folderId) params.append('folderId', filters.folderId);

  return params.toString();
}

export function buildViewQueryString(filters?: ViewFilters): string {
  const params = new URLSearchParams();

  if (filters?.entityType) params.append('entityType', filters.entityType);
  if (filters?.visibility) params.append('visibility', filters.visibility);
  if (filters?.isPinned !== undefined) params.append('isPinned', filters.isPinned.toString());

  return params.toString();
}
