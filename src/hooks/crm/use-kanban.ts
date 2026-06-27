'use client';

import { useState, useEffect, useCallback } from 'react';
import { Deal, Pipeline, PipelineStage } from '@/types/crm';

export interface KanbanStage {
  stage: PipelineStage;
  deals: Deal[];
  totalValue: number;
  dealCount: number;
}

export interface KanbanData {
  pipeline: Pipeline;
  stages: KanbanStage[];
  totalDeals: number;
  totalValue: number;
}

export interface KanbanFilters {
  pipelineId?: string;
  search?: string;
  ownerId?: string;
  priority?: string;
  tags?: string[];
}

export interface UseKanbanResult {
  data: KanbanData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  moveDeal: (dealId: string, targetStageId: string) => Promise<void>;
}

export function useKanban(filters: KanbanFilters): UseKanbanResult {
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKanbanData = useCallback(async () => {
    // Don't fetch if no pipeline selected
    if (!filters.pipelineId) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();
      params.append('pipelineId', filters.pipelineId);

      if (filters.search) params.append('search', filters.search);
      if (filters.ownerId) params.append('ownerId', filters.ownerId);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.tags && filters.tags.length > 0) {
        params.append('tags', filters.tags.join(','));
      }

      const queryString = params.toString();
      const url = `/api/v2/crm/deals/kanban?${queryString}`;

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
        if (response.status === 404) {
          throw new Error('Pipeline not found');
        }
        throw new Error('Failed to fetch kanban data');
      }

      const kanbanData = await response.json();
      setData(kanbanData);
    } catch (err) {
      console.error('Error fetching kanban data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load kanban data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchKanbanData();
  }, [fetchKanbanData]);

  const moveDeal = useCallback(
    async (dealId: string, targetStageId: string) => {
      if (!data) return;

      // Find the deal in current data
      let movedDeal: Deal | null = null;
      let sourceStageId: string | null = null;

      for (const stageData of data.stages) {
        const deal = stageData.deals.find((d) => d._id === dealId);
        if (deal) {
          movedDeal = deal;
          sourceStageId = stageData.stage._id;
          break;
        }
      }

      if (!movedDeal || !sourceStageId) {
        throw new Error('Deal not found');
      }

      // If moving to same stage, do nothing
      if (sourceStageId === targetStageId) {
        return;
      }

      // Optimistically update UI
      const updatedStages = data.stages.map((stageData) => {
        // Remove from source stage
        if (stageData.stage._id === sourceStageId) {
          const newDeals = stageData.deals.filter((d) => d._id !== dealId);
          return {
            ...stageData,
            deals: newDeals,
            dealCount: newDeals.length,
            totalValue: newDeals.reduce((sum, d) => sum + (d.value || 0), 0),
          };
        }

        // Add to target stage
        if (stageData.stage._id === targetStageId) {
          const updatedDeal = {
            ...movedDeal!,
            stageId: targetStageId,
          };
          const newDeals = [...stageData.deals, updatedDeal];
          return {
            ...stageData,
            deals: newDeals,
            dealCount: newDeals.length,
            totalValue: newDeals.reduce((sum, d) => sum + (d.value || 0), 0),
          };
        }

        return stageData;
      });

      // Update state optimistically
      setData({
        ...data,
        stages: updatedStages,
      });

      try {
        // Make API call to update deal stage
        const response = await fetch(`/api/v2/crm/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ stageId: targetStageId }),
        });

        if (!response.ok) {
          throw new Error('Failed to update deal stage');
        }

        // Refetch to get updated stage history and other server-side updates
        await fetchKanbanData();
      } catch (err) {
        console.error('Error moving deal:', err);
        // Rollback on error
        await fetchKanbanData();
        throw err instanceof Error ? err : new Error('Failed to move deal');
      }
    },
    [data, fetchKanbanData]
  );

  return {
    data,
    loading,
    error,
    refetch: fetchKanbanData,
    moveDeal,
  };
}
