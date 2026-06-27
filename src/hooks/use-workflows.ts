import { useState, useEffect, useCallback } from 'react';

export interface Workflow {
  _id: string;
  name: string;
  description?: string;
  type: 'crm' | 'whatsapp' | 'marketing_email' | 'custom';
  status: 'draft' | 'active' | 'paused' | 'archived';
  trigger: Record<string, unknown>;
  nodes: unknown[];
  edges: unknown[];
  version: number;
  executionCount?: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface UseWorkflowsOptions {
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useWorkflows(options: UseWorkflowsOptions = {}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (options.type) params.append('type', options.type);
      if (options.status) params.append('status', options.status);
      if (options.search) params.append('search', options.search);
      params.append('page', String(options.page || 1));
      params.append('limit', String(options.limit || 25));

      const response = await fetch(`/api/v2/workflows?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workflows');
      }

      const data = await response.json();
      setWorkflows(data.workflows || []);
      setPagination(data.pagination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [options.type, options.status, options.search, options.page, options.limit]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const refetch = fetchWorkflows;

  return {
    workflows,
    loading,
    error,
    pagination,
    refetch,
  };
}

export function useWorkflow(id: string | undefined) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflow = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/workflows/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workflow');
      }

      const data = await response.json();
      setWorkflow(data.workflow);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflow');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  const refetch = fetchWorkflow;

  return {
    workflow,
    loading,
    error,
    refetch,
  };
}
