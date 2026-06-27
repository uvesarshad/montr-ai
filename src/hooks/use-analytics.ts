/**
 * React Hook for Workflow Analytics
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface AnalyticsSummary {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  successRate: number;
  averageDuration: number;
  averageStepsPerExecution: number;
}

export interface ExecutionTrendPoint {
  date: string;
  total: number;
  success: number;
  failed: number;
}

export interface WorkflowStat {
  workflowId: string;
  workflowName: string;
  workflowType: string;
  status: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageDuration: number;
}

export interface ErrorDistribution {
  type: string;
  count: number;
}

export interface Analytics {
  summary: AnalyticsSummary;
  executionTrend: ExecutionTrendPoint[];
  workflowStats: WorkflowStat[];
  topFailingWorkflows: WorkflowStat[];
  slowestWorkflows: WorkflowStat[];
  mostActiveWorkflows: WorkflowStat[];
  errorDistribution: ErrorDistribution[];
  timeRange: string;
}

export function useAnalytics(workflowId?: string, timeRange: string = '7d') {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (workflowId) {
        params.append('workflowId', workflowId);
      }
      params.append('timeRange', timeRange);

      const response = await fetch(`/api/v2/workflows/analytics?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (err: unknown) {
      console.error('Error fetching analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [workflowId, timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    analytics,
    loading,
    error,
    refetch: fetchAnalytics,
  };
}
