'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, PaginationMeta } from '@/types/crm';
import { buildActivitySearchParams } from './activity-query';

export interface ActivityFilters {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  type?: string | string[];
  status?: string;
  targetType?: string;
  targetId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  ownerId?: string;
  assignedTo?: string;
  dueAfter?: Date;
  dueBefore?: Date;
  completedAfter?: Date;
  completedBefore?: Date;
  overdue?: boolean;
}

export interface ActivityOptions {
  page?: number;
  limit?: number;
  sort?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface UseActivitiesResult {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
}

// Updated function signature to include options
export function useActivities(filters: ActivityFilters = {}, options: ActivityOptions = {}): UseActivitiesResult {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  void options;

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = buildActivitySearchParams(filters);

      const queryString = params.toString();
      const url = `/api/v2/crm/activities${queryString ? `?${queryString}` : ''}`;

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
        throw new Error('Failed to fetch activities');
      }

      const data = await response.json();
      setActivities(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError(err instanceof Error ? err.message : 'Failed to load activities');
      setActivities([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return {
    activities,
    loading,
    error,
    pagination,
    refetch: fetchActivities,
    refresh: fetchActivities,
  };
}
