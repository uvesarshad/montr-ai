'use client';

import { useState, useEffect, useCallback } from 'react';
import { Pipeline } from '@/types/crm';
import { CreatePipelineInput, UpdatePipelineInput } from '@/validations/crm/pipeline.schema';

export interface PipelineFilters {
  isActive?: boolean;
  sort?: string;
}

export interface UsePipelinesResult {
  pipelines: Pipeline[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createPipeline: (data: CreatePipelineInput) => Promise<Pipeline>;
  updatePipeline: (id: string, data: UpdatePipelineInput) => Promise<Pipeline>;
  deletePipeline: (id: string) => Promise<void>;
  setDefaultPipeline: (id: string) => Promise<void>;
}

export function usePipelines(filters?: PipelineFilters): UsePipelinesResult {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const filtersKey = JSON.stringify(filters);

  const fetchPipelines = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      if (filters?.isActive !== undefined) {
        params.append('isActive', filters.isActive.toString());
      }
      if (filters?.sort) params.append('sort', filters.sort);

      const queryString = params.toString();
      const url = `/api/v2/crm/pipelines${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch pipelines');
      }

      const data = await response.json();
      setPipelines(data.data || data || []);
    } catch (err) {
      console.error('Error fetching pipelines:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pipelines');
      setPipelines([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]); // Use filtersKey instead of filters object

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  const createPipeline = useCallback(
    async (data: CreatePipelineInput): Promise<Pipeline> => {
      try {
        const response = await fetch('/api/v2/crm/pipelines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create pipeline');
        }

        const newPipeline = await response.json();
        setPipelines((prev) => [...prev, newPipeline]);
        return newPipeline;
      } catch (err) {
        console.error('Error creating pipeline:', err);
        throw err instanceof Error ? err : new Error('Failed to create pipeline');
      }
    },
    []
  );

  const updatePipeline = useCallback(
    async (id: string, data: UpdatePipelineInput): Promise<Pipeline> => {
      try {
        const response = await fetch(`/api/v2/crm/pipelines/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update pipeline');
        }

        const updatedPipeline = await response.json();
        setPipelines((prev) =>
          prev.map((pipeline) => (pipeline._id === id ? updatedPipeline : pipeline))
        );
        return updatedPipeline;
      } catch (err) {
        console.error('Error updating pipeline:', err);
        throw err instanceof Error ? err : new Error('Failed to update pipeline');
      }
    },
    []
  );

  const deletePipeline = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/crm/pipelines/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete pipeline');
      }

      setPipelines((prev) => prev.filter((pipeline) => pipeline._id !== id));
    } catch (err) {
      console.error('Error deleting pipeline:', err);
      throw err instanceof Error ? err : new Error('Failed to delete pipeline');
    }
  }, []);

  const setDefaultPipeline = useCallback(
    async (id: string): Promise<void> => {
      try {
        const response = await fetch(`/api/v2/crm/pipelines/${id}/set-default`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to set default pipeline');
        }

        // Refresh pipelines to update default status
        await fetchPipelines();
      } catch (err) {
        console.error('Error setting default pipeline:', err);
        throw err instanceof Error ? err : new Error('Failed to set default pipeline');
      }
    },
    [fetchPipelines]
  );

  return {
    pipelines,
    loading,
    error,
    refetch: fetchPipelines,
    createPipeline,
    updatePipeline,
    deletePipeline,
    setDefaultPipeline,
  };
}
