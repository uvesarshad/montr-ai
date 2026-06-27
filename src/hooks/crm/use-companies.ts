'use client';

import { useState, useEffect, useCallback } from 'react';
import { Company, PaginationMeta } from '@/types/crm';
import { isCancelledRequestError } from './fetch-utils';

export interface CompanyFilters {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  type?: string;
  industry?: string;
  size?: string;
  ownerId?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface UseCompaniesResult {
  companies: Company[];
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCompanies(filters?: CompanyFilters): UseCompaniesResult {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchCompanies = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.search) params.append('search', filters.search);
      if (filters?.sort) params.append('sort', filters.sort);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.industry) params.append('industry', filters.industry);
      if (filters?.size) params.append('size', filters.size);
      if (filters?.ownerId) params.append('ownerId', filters.ownerId);

      if (filters?.tags && filters.tags.length > 0) {
        params.append('tags', filters.tags.join(','));
      }

      if (filters?.createdAfter) {
        params.append('createdAfter', filters.createdAfter.toISOString());
      }

      if (filters?.createdBefore) {
        params.append('createdBefore', filters.createdBefore.toISOString());
      }

      const queryString = params.toString();
      const url = `/api/v2/crm/companies${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 403) {
          throw new Error('No organization found');
        }
        throw new Error('Failed to fetch companies');
      }

      const data = await response.json();
      if (signal?.aborted) {
        return;
      }
      setCompanies(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      if (isCancelledRequestError(err, signal)) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load companies');
      setCompanies([]);
      setPagination(null);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCompanies(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchCompanies]);

  return {
    companies,
    loading,
    error,
    pagination,
    refetch: () => fetchCompanies(),
    refresh: () => fetchCompanies(),
  };
}
