import { useCallback } from 'react';
import useSWR from 'swr';

export type AgentMissionPlanStepStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked';

export interface AgentMissionPlanStep {
  id: string;
  title: string;
  description?: string;
  status: AgentMissionPlanStepStatus;
  startedAt?: string;
  completedAt?: string;
  evidence?: string;
}

export interface AgentMissionPlan {
  goal?: string;
  steps: AgentMissionPlanStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentMissionListItem {
  _id: string;
  title: string;
  summary: string;
  status: 'draft' | 'active' | 'waiting' | 'scheduled' | 'blocked' | 'completed';
  mode: 'mixed' | 'approval-first' | 'autonomous';
  brandId: string;
  activeAgentId: string;
  currentSessionId: string;
  messageCount: number;
  eventCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  /** Present on the mission-detail response (GET /missions/[id]); absent on list rows. */
  plan?: AgentMissionPlan;
}

interface AgentMissionListResponse {
  missions: AgentMissionListItem[];
  count: number;
  total: number;
  statusCounts: Record<string, number>;
}

interface UseAgentMissionsOptions {
  brandId?: string;
  search?: string;
  status?: string;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch agent missions');
  }

  return response.json() as Promise<AgentMissionListResponse>;
};

export function useAgentMissions(options: UseAgentMissionsOptions = {}) {
  const params = new URLSearchParams();

  if (options.brandId) {
    params.set('brandId', options.brandId);
  }

  if (options.search) {
    params.set('search', options.search);
  }

  if (options.status) {
    params.set('status', options.status);
  }

  const query = params.toString();
  const url = `/api/v2/agent/missions${query ? `?${query}` : ''}`;

  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  const createMission = useCallback(
    async (payload?: {
      brandId?: string;
      title?: string;
      summary?: string;
      status?: AgentMissionListItem['status'];
      mode?: AgentMissionListItem['mode'];
    }) => {
      const response = await fetch('/api/v2/agent/missions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload || {}),
      });

      if (!response.ok) {
        throw new Error('Failed to create mission');
      }

      const mission = await response.json();
      await mutate();
      return mission;
    },
    [mutate]
  );

  return {
    missions: data?.missions || [],
    count: data?.count || 0,
    total: data?.total || 0,
    statusCounts: data?.statusCounts || {},
    isLoading,
    error,
    createMission,
    refresh: mutate,
  };
}
