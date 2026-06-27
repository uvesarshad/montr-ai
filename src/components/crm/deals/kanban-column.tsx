'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Deal, PipelineStage } from '@/types/crm';
import { DealCard } from './deal-card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KanbanColumnProps {
  stage: PipelineStage;
  deals: Deal[];
  totalValue: number;
  dealCount: number;
  onAddDeal?: (stageId: string) => void;
  onEditDeal?: (deal: Deal) => void;
  onDeleteDeal?: (dealId: string) => void;
}

export function KanbanColumn({
  stage,
  deals,
  totalValue,
  dealCount,
  onAddDeal,
  onEditDeal,
  onDeleteDeal,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage._id,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: 'compact',
    }).format(value);
  };

  return (
    <div className="flex-shrink-0 w-80 flex flex-col h-full">
      {/* Stage Header */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="size-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-semibold text-sm flex-1 truncate">{stage.name}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={() => onAddDeal?.(stage._id)}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {dealCount} {dealCount === 1 ? 'deal' : 'deals'}
          </span>
          {totalValue > 0 && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="font-medium">{formatCurrency(totalValue)}</span>
            </>
          )}
        </div>
      </div>

      {/* Droppable Area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-2xl transition-all duration-300 min-h-[200px]',
          isOver
            ? 'border border-primary/40 bg-primary/10 shadow-[inset_0_0_20px_rgba(169,139,250,0.15)]'
            : 'border border-border/30 bg-card/20 backdrop-blur-md hover:bg-card/30'
        )}
      >
        <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
            <SortableContext
              items={deals.map((d) => d._id)}
              strategy={verticalListSortingStrategy}
            >
              {deals.map((deal) => (
                <DealCard
                  key={deal._id}
                  deal={deal}
                  onEdit={onEditDeal}
                  onDelete={onDeleteDeal}
                />
              ))}
            </SortableContext>

            {/* Add Deal Button (bottom) */}
            {deals.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => onAddDeal?.(stage._id)}
              >
                <Plus className="size-4 mr-2" />
                Add Deal
              </Button>
            )}

            {/* Empty State */}
            {deals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  No deals in this stage
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddDeal?.(stage._id)}
                >
                  <Plus className="size-4 mr-2" />
                  Add Deal
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
