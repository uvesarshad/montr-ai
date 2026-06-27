'use client';

import { useState, useEffect, useCallback } from 'react';
import { Workflow } from './use-workflows';

export interface WorkflowLog {
  _id: string;
  workflowId: string;
  entityId: string;
  entityType: string;
  status: 'success' | 'failed' | 'partial';
  actionsExecuted: number;
  actionsFailed: number;
  errors: string[];
  executionTimeMs: number;
  triggeredAt: Date;
  createdAt: Date;
}

export interface UseWorkflowResult {
  workflow: Workflow | null;
  logs: WorkflowLog[];
  loading: boolean;
  logsLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  test: (entityId: string, dryRun?: boolean) => Promise<unknown>;
}

export function useWorkflow(id: string | null): UseWorkflowResult {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflow = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/workflows/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 404) {
          throw new Error('Workflow not found');
        }
        throw new Error('Failed to fetch workflow');
      }

      const data = await response.json();
      setWorkflow(data.data);
    } catch (err) {
      console.error('Error fetching workflow:', err);
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
      setWorkflow(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchLogs = useCallback(async () => {
    if (!id) return;

    try {
      setLogsLoading(true);

      const response = await fetch(`/api/v2/crm/workflows/${id}/logs?limit=50`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      setLogs(data.data || []);
    } catch (err) {
      console.error('Error fetching workflow logs:', err);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [id]);

  const test = async (entityId: string, dryRun: boolean = true) => {
    if (!id) {
      throw new Error('No workflow ID');
    }

    try {
      const response = await fetch(`/api/v2/crm/workflows/${id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ entityId, dryRun }),
      });

      if (!response.ok) {
        throw new Error('Failed to test workflow');
      }

      const data = await response.json();
      await fetchLogs(); // Refresh logs after test
      return data;
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    fetchWorkflow();
    fetchLogs();
  }, [fetchWorkflow, fetchLogs]);

  return {
    workflow,
    logs,
    loading,
    logsLoading,
    error,
    refetch: fetchWorkflow,
    test,
  };
}
