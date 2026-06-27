import useSWR from 'swr';

export interface AgentMissionApproval {
  _id: string;
  missionId?: string | null;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolDescription: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt?: string;
}

export interface AgentMissionScheduledTask {
  _id: string;
  missionId?: string | null;
  name: string;
  description: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed' | 'failed';
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: {
    success: boolean;
    message: string;
    timestamp: string;
  };
}

export interface AgentMissionContextSummary {
  approvals: Array<{
    id: string;
    toolName: string;
    description: string;
    expiresAt?: string | Date;
    createdAt: string | Date;
  }>;
  scheduledTasks: Array<{
    id: string;
    name: string;
    description: string;
    nextRunAt?: string | Date;
    status: 'active';
  }>;
  linkedAssetCount: number;
  pendingApprovalCount: number;
  queuedRunCount: number;
  failedTaskCount: number;
  status: 'draft' | 'active' | 'waiting' | 'scheduled' | 'blocked' | 'completed';
}

interface AgentMissionContextResponse {
  summary: AgentMissionContextSummary;
  approvals: AgentMissionApproval[];
  scheduledTasks: AgentMissionScheduledTask[];
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch mission context');
  }

  return response.json() as Promise<AgentMissionContextResponse>;
};

export function useAgentMissionContext(missionId?: string | null, refreshInterval?: number) {
  const { data, error, isLoading, mutate } = useSWR(
    missionId ? `/api/v2/agent/missions/${missionId}/context` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 1500,
      refreshInterval,
    }
  );

  return {
    summary: data?.summary || null,
    approvals: data?.approvals || [],
    scheduledTasks: data?.scheduledTasks || [],
    isLoading,
    error,
    refresh: mutate,
  };
}
