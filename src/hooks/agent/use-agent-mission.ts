import { useCallback } from 'react';
import useSWR from 'swr';

import { AgentMissionListItem } from './use-agent-missions';

export interface AgentMissionEvent {
  _id: string;
  missionId: string;
  type: 'message' | 'plan_step' | 'tool_call' | 'tool_result' | 'approval_request' | 'artifact_created' | 'scheduled_action' | 'status_change' | 'error';
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMissionLink {
  _id: string;
  missionId: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  targetRoute?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AgentMissionResponse {
  mission: AgentMissionListItem;
  events: AgentMissionEvent[];
  links: AgentMissionLink[];
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch agent mission');
  }

  return response.json() as Promise<AgentMissionResponse>;
};

export function useAgentMission(missionId?: string | null, refreshInterval?: number) {
  const { data, error, isLoading, mutate } = useSWR(
    missionId ? `/api/v2/agent/missions/${missionId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 1500,
      refreshInterval,
    }
  );

  const updateMission = useCallback(
    async (payload: Partial<Pick<AgentMissionListItem, 'title' | 'summary' | 'status' | 'mode'>>) => {
      if (!missionId) {
        throw new Error('Mission id is required');
      }

      const response = await fetch(`/api/v2/agent/missions/${missionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to update mission');
      }

      const mission = await response.json();
      await mutate();
      return mission;
    },
    [missionId, mutate]
  );

  return {
    mission: data?.mission || null,
    events: data?.events || [],
    links: data?.links || [],
    isLoading,
    error,
    updateMission,
    refresh: mutate,
  };
}
