'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Favorite } from '@/types/crm';
import { buildFavoriteQueryString } from './query-filters';

export interface FavoriteFilters {
  targetType?: string;
  folderId?: string;
}

export interface UseFavoritesResult {
  favorites: Favorite[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addFavorite: (targetType: string, targetId: string) => Promise<Favorite>;
  removeFavorite: (id: string) => Promise<void>;
  isFavorite: (targetId: string) => boolean;
  toggleFavorite: (targetType: string, targetId: string) => Promise<void>;
  reorderFavorites: (favoriteIds: string[]) => Promise<void>;
}

export function useFavorites(filters?: FavoriteFilters): UseFavoritesResult {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const targetType = filters?.targetType;
  const folderId = filters?.folderId;
  const queryString = useMemo(
    () => buildFavoriteQueryString({ targetType, folderId }),
    [targetType, folderId]
  );

  const fetchFavorites = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/v2/crm/favorites${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch favorites');
      }

      const data = await response.json();
      setFavorites(data.data || data || []);
    } catch (err) {
      console.error('Error fetching favorites:', err);
      setError(err instanceof Error ? err.message : 'Failed to load favorites');
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const addFavorite = useCallback(
    async (targetType: string, targetId: string): Promise<Favorite> => {
      try {
        const response = await fetch('/api/v2/crm/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetType, targetId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to add favorite');
        }

        const newFavorite = await response.json();
        setFavorites((prev) => [...prev, newFavorite]);
        return newFavorite;
      } catch (err) {
        console.error('Error adding favorite:', err);
        throw err instanceof Error ? err : new Error('Failed to add favorite');
      }
    },
    []
  );

  const removeFavorite = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/crm/favorites/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove favorite');
      }

      setFavorites((prev) => prev.filter((fav) => fav._id !== id));
    } catch (err) {
      console.error('Error removing favorite:', err);
      throw err instanceof Error ? err : new Error('Failed to remove favorite');
    }
  }, []);

  const isFavorite = useCallback(
    (targetId: string): boolean => {
      return favorites.some((fav) => fav.targetId === targetId);
    },
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (targetType: string, targetId: string): Promise<void> => {
      const existing = favorites.find((fav) => fav.targetId === targetId);

      if (existing) {
        await removeFavorite(existing._id);
      } else {
        await addFavorite(targetType, targetId);
      }
    },
    [favorites, addFavorite, removeFavorite]
  );

  const reorderFavorites = useCallback(
    async (favoriteIds: string[]): Promise<void> => {
      try {
        const response = await fetch('/api/v2/crm/favorites/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ favoriteIds }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to reorder favorites');
        }

        await fetchFavorites();
      } catch (err) {
        console.error('Error reordering favorites:', err);
        throw err instanceof Error ? err : new Error('Failed to reorder favorites');
      }
    },
    [fetchFavorites]
  );

  return {
    favorites,
    loading,
    error,
    refetch: fetchFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    reorderFavorites,
  };
}
