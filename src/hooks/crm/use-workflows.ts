'use client';

import { useState, useEffect, useCallback } from 'react';
import { PaginationMeta } from '@/types/crm';

export interface Workflow {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  trigger: {
    type: string;
    entityType: 'contact' | 'company' | 'deal';
    config: Record<string, unknown>;
  };
  conditions: Array<{
    field: string;
    operator: string;
    value: unknown;
    conjunction: 'and' | 'or';
  }>;
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  runOnce: boolean;
  maxExecutions?: number;
  cooldownMinutes?: number;
  executionCount: number;
  errorCount: number;
  lastExecutedAt?: Date;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowFilters {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  isActive?: boolean;
  triggerType?: string;
  entityType?: 'contact' | 'company' | 'deal';
  createdById?: string;
}

export interface UseWorkflowsResult {
  workflows: Workflow[];
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
  activate: (id: string) => Promise<void>;
  deactivate: (id: string) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
}

export function useWorkflows(filters?: WorkflowFilters): UseWorkflowsResult {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const filtersKey = JSON.stringify(filters);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.search) params.append('search', filters.search);
      if (filters?.sort) params.append('sort', filters.sort);
      if (filters?.isActive !== undefined) params.append('isActive', filters.isActive.toString());
      if (filters?.triggerType) params.append('triggerType', filters.triggerType);
      if (filters?.entityType) params.append('entityType', filters.entityType);
      if (filters?.createdById) params.append('createdById', filters.createdById);

      const queryString = params.toString();
      const url = `/api/v2/crm/workflows${queryString ? `?${queryString}` : ''}`;

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
        throw new Error('Failed to fetch workflows');
      }

      const data = await response.json();
      setWorkflows(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Error fetching workflows:', err);
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
      setWorkflows([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const activate = async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/workflows/${id}/activate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isActive: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to activate workflow');
      }

      await fetchWorkflows();
    } catch (err) {
      throw err;
    }
  };

  const deactivate = async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/workflows/${id}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to deactivate workflow');
      }

      await fetchWorkflows();
    } catch (err) {
      throw err;
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/workflows/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete workflow');
      }

      await fetchWorkflows();
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  return {
    workflows,
    loading,
    error,
    pagination,
    refetch: fetchWorkflows,
    refresh: fetchWorkflows,
    activate,
    deactivate,
    deleteWorkflow,
  };
}
