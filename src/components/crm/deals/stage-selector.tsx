'use client';

import { useState } from 'react';
import { Pipeline } from '@/types/crm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface StageSelectorProps {
  pipeline: Pipeline;
  currentStageId: string;
  dealId: string;
  onStageChange?: () => void;
}

export function StageSelector({
  pipeline,
  currentStageId,
  dealId,
  onStageChange,
}: StageSelectorProps) {
  const [isChanging, setIsChanging] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState(currentStageId);
  const { toast } = useToast();

  const handleStageChange = async (newStageId: string) => {
    if (newStageId === currentStageId) return;

    try {
      setIsChanging(true);
      setSelectedStageId(newStageId);

      const response = await fetch(`/api/v2/crm/deals/${dealId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stageId: newStageId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to change stage');
      }

      toast({
        title: 'Success',
        description: 'Deal stage updated successfully',
      });

      onStageChange?.();
    } catch (error) {
      console.error('Error changing stage:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to change stage',
      });
      // Revert to current stage on error
      setSelectedStageId(currentStageId);
    } finally {
      setIsChanging(false);
    }
  };

  const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedStageId}
        onValueChange={handleStageChange}
        disabled={isChanging}
      >
        <SelectTrigger className="w-[200px]">
          {isChanging ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Updating...</span>
            </div>
          ) : (
            <SelectValue placeholder="Select stage" />
          )}
        </SelectTrigger>
        <SelectContent>
          {sortedStages.map((stage) => (
            <SelectItem key={stage._id} value={stage._id}>
              <div className="flex items-center gap-2">
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                {stage.name} ({stage.probability}%)
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
