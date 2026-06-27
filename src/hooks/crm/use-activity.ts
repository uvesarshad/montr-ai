'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity } from '@/types/crm';
import { CreateActivityInput, UpdateActivityInput } from '@/validations/crm/activity.schema';

export interface UseActivityResult {
  activity: Activity | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateActivity: (data: UpdateActivityInput) => Promise<Activity>;
  deleteActivity: () => Promise<void>;
  createActivity: (data: CreateActivityInput) => Promise<Activity>;
  completeActivity: () => Promise<Activity>;
  uncompleteActivity: () => Promise<Activity>;
}

export function useActivity(id?: string): UseActivityResult {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/activities/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 404) {
          throw new Error('Activity not found');
        }
        throw new Error('Failed to fetch activity');
      }

      const data = await response.json();
      setActivity(data);
    } catch (err) {
      console.error('Error fetching activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to load activity');
      setActivity(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const createActivity = useCallback(async (data: CreateActivityInput): Promise<Activity> => {
    try {
      const response = await fetch('/api/v2/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create activity');
      }

      const newActivity = await response.json();
      setActivity(newActivity);
      return newActivity;
    } catch (err) {
      console.error('Error creating activity:', err);
      throw err instanceof Error ? err : new Error('Failed to create activity');
    }
  }, []);

  const updateActivity = useCallback(
    async (data: UpdateActivityInput): Promise<Activity> => {
      if (!id) {
        throw new Error('No activity ID provided');
      }

      try {
        const response = await fetch(`/api/v2/crm/activities/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update activity');
        }

        const updatedActivity = await response.json();
        setActivity(updatedActivity);
        return updatedActivity;
      } catch (err) {
        console.error('Error updating activity:', err);
        throw err instanceof Error ? err : new Error('Failed to update activity');
      }
    },
    [id]
  );

  const deleteActivity = useCallback(async (): Promise<void> => {
    if (!id) {
      throw new Error('No activity ID provided');
    }

    try {
      const response = await fetch(`/api/v2/crm/activities/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete activity');
      }

      setActivity(null);
    } catch (err) {
      console.error('Error deleting activity:', err);
      throw err instanceof Error ? err : new Error('Failed to delete activity');
    }
  }, [id]);

  const completeActivity = useCallback(async (): Promise<Activity> => {
    if (!id) {
      throw new Error('No activity ID provided');
    }

    try {
      const response = await fetch(`/api/v2/crm/activities/${id}/complete`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete activity');
      }

      const updatedActivity = await response.json();
      setActivity(updatedActivity);
      return updatedActivity;
    } catch (err) {
      console.error('Error completing activity:', err);
      throw err instanceof Error ? err : new Error('Failed to complete activity');
    }
  }, [id]);

  const uncompleteActivity = useCallback(async (): Promise<Activity> => {
    if (!id) {
      throw new Error('No activity ID provided');
    }

    try {
      const response = await fetch(`/api/v2/crm/activities/${id}/uncomplete`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to uncomplete activity');
      }

      const updatedActivity = await response.json();
      setActivity(updatedActivity);
      return updatedActivity;
    } catch (err) {
      console.error('Error uncompleting activity:', err);
      throw err instanceof Error ? err : new Error('Failed to uncomplete activity');
    }
  }, [id]);

  return {
    activity,
    loading,
    error,
    refetch: fetchActivity,
    updateActivity,
    deleteActivity,
    createActivity,
    completeActivity,
    uncompleteActivity,
  };
}
