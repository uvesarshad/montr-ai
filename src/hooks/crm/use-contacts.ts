'use client';

import { useState, useEffect, useCallback } from 'react';
import { Contact, PaginationMeta } from '@/types/crm';

export interface ContactFilters {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  status?: string | string[];
  lifecycle?: string;
  rating?: string;
  ownerId?: string;
  companyId?: string;
  tags?: string[];
  source?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  /** Nested AND/OR filter tree from a saved view (serialized as JSON param). */
  filterTree?: unknown;
}

export interface UseContactsResult {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useContacts(filters?: ContactFilters): UseContactsResult {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchContacts = useCallback(async () => {
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

      if (filters?.lifecycle) params.append('lifecycle', filters.lifecycle);
      if (filters?.rating) params.append('rating', filters.rating);
      if (filters?.ownerId) params.append('ownerId', filters.ownerId);
      if (filters?.companyId) params.append('companyId', filters.companyId);
      if (filters?.source) params.append('source', filters.source);

      if (filters?.tags && filters.tags.length > 0) {
        params.append('tags', filters.tags.join(','));
      }

      if (filters?.createdAfter) {
        params.append('createdAfter', filters.createdAfter.toISOString());
      }

      if (filters?.createdBefore) {
        params.append('createdBefore', filters.createdBefore.toISOString());
      }

      if (filters?.filterTree) {
        params.append('filterTree', JSON.stringify(filters.filterTree));
      }

      const queryString = params.toString();
      const url = `/api/v2/crm/contacts${queryString ? `?${queryString}` : ''}`;

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
        throw new Error('Failed to fetch contacts');
      }

      const data = await response.json();
      setContacts(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Error fetching contacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
      setContacts([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return {
    contacts,
    loading,
    error,
    pagination,
    refetch: fetchContacts,
    refresh: fetchContacts,
  };
}
