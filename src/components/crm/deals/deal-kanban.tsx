'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { useKanban, KanbanFilters } from '@/hooks/crm/use-kanban';
import { usePipelines } from '@/hooks/crm/use-pipelines';
import { Deal } from '@/types/crm';
import { KanbanColumn } from './kanban-column';
import { DealCard } from './deal-card';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface DealKanbanProps {
  filters?: Omit<KanbanFilters, 'pipelineId'>;
  onAddDeal?: (stageId?: string) => void;
  onEditDeal?: (deal: Deal) => void;
  onDeleteDeal?: (dealId: string) => void;
}

export function DealKanban({
  filters,
  onAddDeal,
  onEditDeal,
  onDeleteDeal,
}: DealKanbanProps) {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  // Memoize pipeline filters to prevent infinite loops
  const pipelineFilters = useMemo(() => ({ isActive: true }), []);

  const { pipelines, loading: pipelinesLoading } = usePipelines(pipelineFilters);

  const { data, loading, error, moveDeal, refetch } = useKanban({
    pipelineId: selectedPipelineId,
    ...filters,
  });

  // Set default pipeline when pipelines load
  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      const defaultPipeline = pipelines.find((p) => p.isDefault) || pipelines[0];
      setSelectedPipelineId(defaultPipeline._id);
    }
  }, [pipelines, selectedPipelineId]);

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const dealId = active.id as string;

    // Find the deal being dragged
    if (data) {
      for (const stageData of data.stages) {
        const deal = stageData.deals.find((d) => d._id === dealId);
        if (deal) {
          setActiveDeal(deal);
          break;
        }
      }
    }
  }, [data]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDeal(null);

      if (!over || active.id === over.id) return;

      const dealId = active.id as string;
      const targetStageId = over.id as string;

      try {
        await moveDeal(dealId, targetStageId);
        toast.success('Deal moved successfully');
      } catch (error) {
        toast.error('Failed to move deal');
        console.error('Error moving deal:', error);
      }
    },
    [moveDeal]
  );

  const handleDeleteDeal = useCallback(
    async (dealId: string) => {
      if (onDeleteDeal) {
        onDeleteDeal(dealId);
      } else {
        // Default delete implementation
        try {
          const response = await fetch(`/api/v2/crm/deals/${dealId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to delete deal');
          }

          toast.success('Deal deleted successfully');
          refetch();
        } catch (error) {
          toast.error('Failed to delete deal');
          console.error('Error deleting deal:', error);
        }
      }
    },
    [onDeleteDeal, refetch]
  );

  // Loading state
  if (pipelinesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-96 w-80" />
          <Skeleton className="h-96 w-80" />
          <Skeleton className="h-96 w-80" />
        </div>
      </div>
    );
  }

  // No pipelines state
  if (pipelines.length === 0) {
    return (
      <Alert>
        <AlertCircle className="size-4" />
        <AlertDescription>
          No pipelines found. Create a pipeline first to start managing deals.
        </AlertDescription>
      </Alert>
    );
  }

  // No pipeline selected state
  if (!selectedPipelineId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline._id} value={pipeline._id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>Select a pipeline to view deals</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pipeline Selector and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select a pipeline" />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline._id} value={pipeline._id}>
                {pipeline.name}
                {pipeline.isDefault && (
                  <span className="ml-2 text-xs text-muted-foreground">(Default)</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => onAddDeal?.()} className="w-full sm:w-auto">
          <Plus className="size-4 mr-2" />
          New Deal
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex gap-4">
          <Skeleton className="h-96 w-80" />
          <Skeleton className="h-96 w-80" />
          <Skeleton className="h-96 w-80" />
        </div>
      )}

      {/* Kanban Board */}
      {!loading && data && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4 h-[calc(100vh-16rem)]">
              {data.stages.map((stageData) => (
                <KanbanColumn
                  key={stageData.stage._id}
                  stage={stageData.stage}
                  deals={stageData.deals}
                  totalValue={stageData.totalValue}
                  dealCount={stageData.dealCount}
                  onAddDeal={onAddDeal}
                  onEditDeal={onEditDeal}
                  onDeleteDeal={handleDeleteDeal}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeDeal ? (
              <div className="rotate-3 opacity-80">
                <DealCard deal={activeDeal} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Empty State */}
      {!loading && data && data.totalDeals === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No deals in this pipeline yet
          </p>
          <Button onClick={() => onAddDeal?.()}>
            <Plus className="size-4 mr-2" />
            Create Your First Deal
          </Button>
        </div>
      )}
    </div>
  );
}
