'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag, PaginationMeta } from '@/types/crm';
import { CreateTagInput, UpdateTagInput } from '@/validations/crm/tag.schema';

export interface TagFilters {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  sort?: string;
}

export interface UseTagsResult {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  createTag: (data: CreateTagInput) => Promise<Tag>;
  updateTag: (id: string, data: UpdateTagInput) => Promise<Tag>;
  deleteTag: (id: string) => Promise<void>;
  mergeTag: (sourceId: string, targetId: string) => Promise<void>;
}

export function useTags(filters?: TagFilters): UseTagsResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const filtersKey = JSON.stringify(filters);

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.search) params.append('search', filters.search);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.sort) params.append('sort', filters.sort);

      const queryString = params.toString();
      const url = `/api/v2/crm/tags${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch tags');
      }

      const data = await response.json();
      setTags(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Error fetching tags:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tags');
      setTags([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]); // Use filtersKey instead of filters object

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = useCallback(
    async (data: CreateTagInput): Promise<Tag> => {
      try {
        const response = await fetch('/api/v2/crm/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create tag');
        }

        const newTag = await response.json();
        setTags((prev) => [newTag, ...prev]);
        return newTag;
      } catch (err) {
        console.error('Error creating tag:', err);
        throw err instanceof Error ? err : new Error('Failed to create tag');
      }
    },
    []
  );

  const updateTag = useCallback(
    async (id: string, data: UpdateTagInput): Promise<Tag> => {
      try {
        const response = await fetch(`/api/v2/crm/tags/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update tag');
        }

        const updatedTag = await response.json();
        setTags((prev) => prev.map((tag) => (tag._id === id ? updatedTag : tag)));
        return updatedTag;
      } catch (err) {
        console.error('Error updating tag:', err);
        throw err instanceof Error ? err : new Error('Failed to update tag');
      }
    },
    []
  );

  const deleteTag = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/crm/tags/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete tag');
      }

      setTags((prev) => prev.filter((tag) => tag._id !== id));
    } catch (err) {
      console.error('Error deleting tag:', err);
      throw err instanceof Error ? err : new Error('Failed to delete tag');
    }
  }, []);

  const mergeTag = useCallback(
    async (sourceId: string, targetId: string): Promise<void> => {
      try {
        const response = await fetch(`/api/v2/crm/tags/${sourceId}/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to merge tags');
        }

        // Refresh tags after merge
        await fetchTags();
      } catch (err) {
        console.error('Error merging tags:', err);
        throw err instanceof Error ? err : new Error('Failed to merge tags');
      }
    },
    [fetchTags]
  );

  return {
    tags,
    loading,
    error,
    pagination,
    refetch: fetchTags,
    createTag,
    updateTag,
    deleteTag,
    mergeTag,
  };
}
