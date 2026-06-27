'use client';

import { useState, useEffect, useCallback } from 'react';
import { Deal, PaginationMeta } from '@/types/crm';

export interface DealFilters {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  status?: string | string[];
  priority?: string;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  contactId?: string;
  companyId?: string;
  tags?: string[];
  minValue?: number;
  maxValue?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  expectedCloseAfter?: Date;
  expectedCloseBefore?: Date;
}

export interface UseDealsResult {
  deals: Deal[];
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDeals(filters?: DealFilters): UseDealsResult {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.search) params.append('search', filters.search);
      if (filters?.sort) params.append('sort', filters.sort);

      if (filters?.status) {
        const statusValue = Array.isArray(filters.status)
          ? filters.status.join(',')
          : filters.status;
        params.append('status', statusValue);
      }

      if (filters?.priority) params.append('priority', filters.priority);
      if (filters?.pipelineId) params.append('pipelineId', filters.pipelineId);
      if (filters?.stageId) params.append('stageId', filters.stageId);
      if (filters?.ownerId) params.append('ownerId', filters.ownerId);
      if (filters?.contactId) params.append('contactId', filters.contactId);
      if (filters?.companyId) params.append('companyId', filters.companyId);

      if (filters?.tags && filters.tags.length > 0) {
        params.append('tags', filters.tags.join(','));
      }

      if (filters?.minValue !== undefined) {
        params.append('minValue', filters.minValue.toString());
      }

      if (filters?.maxValue !== undefined) {
        params.append('maxValue', filters.maxValue.toString());
      }

      if (filters?.createdAfter) {
        params.append('createdAfter', filters.createdAfter.toISOString());
      }

      if (filters?.createdBefore) {
        params.append('createdBefore', filters.createdBefore.toISOString());
      }

      if (filters?.expectedCloseAfter) {
        params.append('expectedCloseAfter', filters.expectedCloseAfter.toISOString());
      }

      if (filters?.expectedCloseBefore) {
        params.append('expectedCloseBefore', filters.expectedCloseBefore.toISOString());
      }

      const queryString = params.toString();
      const url = `/api/v2/crm/deals${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 403) {
          throw new Error('No organization found');
        }
        throw new Error('Failed to fetch deals');
      }

      const data = await response.json();
      setDeals(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deals');
      setDeals([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  return {
    deals,
    loading,
    error,
    pagination,
    refetch: fetchDeals,
    refresh: fetchDeals,
  };
}
