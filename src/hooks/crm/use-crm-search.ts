'use client';

import { useState, useCallback } from 'react';

export interface SearchResult {
  type: 'contact' | 'company' | 'deal' | 'activity';
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  avatar?: string;
  metadata?: Record<string, unknown>;
}

export interface UseCrmSearchResult {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  search: (query: string, types?: string[]) => Promise<void>;
  clearResults: () => void;
}

export function useCrmSearch(): UseCrmSearchResult {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, types?: string[]): Promise<void> => {
    if (!query || query.trim().length === 0) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build query string
      const params = new URLSearchParams();
      params.append('q', query);

      if (types && types.length > 0) {
        params.append('types', types.join(','));
      }

      const url = `/api/v2/crm/search?${params.toString()}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Search failed');
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      console.error('Error searching:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    search,
    clearResults,
  };
}
