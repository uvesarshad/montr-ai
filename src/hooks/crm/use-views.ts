'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { View } from '@/types/crm';
import { CreateViewInput, UpdateViewInput } from '@/validations/crm/view.schema';
import { buildViewQueryString } from './query-filters';

export interface ViewFilters {
  entityType?: string;
  visibility?: string;
  isPinned?: boolean;
}

export interface UseViewsResult {
  views: View[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createView: (data: CreateViewInput) => Promise<View>;
  updateView: (id: string, data: UpdateViewInput) => Promise<View>;
  deleteView: (id: string) => Promise<void>;
  pinView: (id: string) => Promise<void>;
  unpinView: (id: string) => Promise<void>;
  setDefaultView: (id: string) => Promise<void>;
  reorderViews: (viewIds: string[]) => Promise<void>;
}

export function useViews(filters?: ViewFilters): UseViewsResult {
  const [views, setViews] = useState<View[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entityType = filters?.entityType;
  const visibility = filters?.visibility;
  const isPinned = filters?.isPinned;
  const queryString = useMemo(
    () => buildViewQueryString({ entityType, visibility, isPinned }),
    [entityType, visibility, isPinned]
  );

  const fetchViews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/v2/crm/views${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch views');
      }

      const data = await response.json();
      setViews(data.data || data || []);
    } catch (err) {
      console.error('Error fetching views:', err);
      setError(err instanceof Error ? err.message : 'Failed to load views');
      setViews([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  const createView = useCallback(
    async (data: CreateViewInput): Promise<View> => {
      try {
        const response = await fetch('/api/v2/crm/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create view');
        }

        const newView = await response.json();
        setViews((prev) => [...prev, newView]);
        return newView;
      } catch (err) {
        console.error('Error creating view:', err);
        throw err instanceof Error ? err : new Error('Failed to create view');
      }
    },
    []
  );

  const updateView = useCallback(
    async (id: string, data: UpdateViewInput): Promise<View> => {
      try {
        const response = await fetch(`/api/v2/crm/views/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update view');
        }

        const updatedView = await response.json();
        setViews((prev) => prev.map((view) => (view._id === id ? updatedView : view)));
        return updatedView;
      } catch (err) {
        console.error('Error updating view:', err);
        throw err instanceof Error ? err : new Error('Failed to update view');
      }
    },
    []
  );

  const deleteView = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/crm/views/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete view');
      }

      setViews((prev) => prev.filter((view) => view._id !== id));
    } catch (err) {
      console.error('Error deleting view:', err);
      throw err instanceof Error ? err : new Error('Failed to delete view');
    }
  }, []);

  const pinView = useCallback(
    async (id: string): Promise<void> => {
      try {
        const response = await fetch(`/api/v2/crm/views/${id}/pin`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to pin view');
        }

        await fetchViews();
      } catch (err) {
        console.error('Error pinning view:', err);
        throw err instanceof Error ? err : new Error('Failed to pin view');
      }
    },
    [fetchViews]
  );

  const unpinView = useCallback(
    async (id: string): Promise<void> => {
      try {
        const response = await fetch(`/api/v2/crm/views/${id}/unpin`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to unpin view');
        }

        await fetchViews();
      } catch (err) {
        console.error('Error unpinning view:', err);
        throw err instanceof Error ? err : new Error('Failed to unpin view');
      }
    },
    [fetchViews]
  );

  const setDefaultView = useCallback(
    async (id: string): Promise<void> => {
      try {
        const response = await fetch(`/api/v2/crm/views/${id}/default`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to set default view');
        }

        await fetchViews();
      } catch (err) {
        console.error('Error setting default view:', err);
        throw err instanceof Error ? err : new Error('Failed to set default view');
      }
    },
    [fetchViews]
  );

  const reorderViews = useCallback(
    async (viewIds: string[]): Promise<void> => {
      try {
        const response = await fetch('/api/v2/crm/views/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ viewIds }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to reorder views');
        }

        await fetchViews();
      } catch (err) {
        console.error('Error reordering views:', err);
        throw err instanceof Error ? err : new Error('Failed to reorder views');
      }
    },
    [fetchViews]
  );

  return {
    views,
    loading,
    error,
    refetch: fetchViews,
    createView,
    updateView,
    deleteView,
    pinView,
    unpinView,
    setDefaultView,
    reorderViews,
  };
}
