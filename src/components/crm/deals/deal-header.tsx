'use client';

import { useState } from 'react';
import { Deal, Pipeline } from '@/types/crm';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DealStatusBadge } from './deal-status-badge';
import { DealPriorityBadge } from './deal-priority-badge';
import { MarkWonDialog } from './mark-won-dialog';
import { MarkLostDialog } from './mark-lost-dialog';
import {
  Edit,
  MoreVertical,
  Trash2,
  Trophy,
  XCircle,
  RotateCcw,
  Copy,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { RunAutomationMenu } from '@/components/crm/run-automation-menu';

interface DealHeaderProps {
  deal: Deal;
  pipeline: Pipeline;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdate?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

export function DealHeader({
  deal,
  pipeline,
  onEdit,
  onDelete,
  onUpdate,
  onToggleFavorite,
  isFavorite,
}: DealHeaderProps) {
  const [isWonDialogOpen, setIsWonDialogOpen] = useState(false);
  const [isLostDialogOpen, setIsLostDialogOpen] = useState(false);
  const { toast } = useToast();
  const _router = useRouter();

  const currentStage = pipeline.stages.find((s) => s._id === deal.stageId);
  const isOpen = deal.status === 'open';
  const isClosed = deal.status === 'won' || deal.status === 'lost';

  const handleReopen = async () => {
    try {
      const response = await fetch(`/api/v2/crm/deals/${deal._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'open' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reopen deal');
      }

      toast({
        title: 'Success',
        description: 'Deal reopened successfully',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error reopening deal:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reopen deal',
      });
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/crm/deals/${deal._id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link Copied',
      description: 'Deal link copied to clipboard',
    });
  };

  return (
    <>
      <div className="flex items-start justify-between pb-6 border-b">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold truncate">{deal.name}</h1>
            {onToggleFavorite && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFavorite}
                className="size-8 p-0 flex-shrink-0"
              >
                <Star
                  className={cn('size-4', isFavorite && 'fill-yellow-400 text-yellow-400')}
                />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-bold text-primary">
              {deal.currency} {deal.value.toLocaleString()}
            </span>
            {currentStage && (
              <span className="text-sm text-muted-foreground">
                • {currentStage.name} ({currentStage.probability}%)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DealStatusBadge status={deal.status} />
            <DealPriorityBadge priority={deal.priority} showIcon />
            {deal.expectedCloseDate && (
              <span className="text-sm text-muted-foreground">
                Expected close: {new Date(deal.expectedCloseDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <RunAutomationMenu entityType="deal" recordIds={[deal._id]} availability="single" />
          {isOpen && (
            <>
              {onEdit && (
                <Button onClick={onEdit} size="sm">
                  <Edit className="mr-2 size-4" />
                  Edit
                </Button>
              )}

              <Button onClick={() => setIsWonDialogOpen(true)} size="sm" variant="default">
                <Trophy className="mr-2 size-4" />
                Mark Won
              </Button>

              <Button
                onClick={() => setIsLostDialogOpen(true)}
                size="sm"
                variant="outline"
              >
                <XCircle className="mr-2 size-4" />
                Mark Lost
              </Button>
            </>
          )}

          {isClosed && (
            <Button onClick={handleReopen} size="sm" variant="outline">
              <RotateCcw className="mr-2 size-4" />
              Reopen
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyLink}>
                <Copy className="mr-2 size-4" />
                Copy Link
              </DropdownMenuItem>
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="mr-2 size-4" />
                  Edit Deal
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isWonDialogOpen && (
        <MarkWonDialog
          open={isWonDialogOpen}
          onOpenChange={setIsWonDialogOpen}
          deal={deal}
          onSuccess={onUpdate}
        />
      )}

      {isLostDialogOpen && (
        <MarkLostDialog
          open={isLostDialogOpen}
          onOpenChange={setIsLostDialogOpen}
          deal={deal}
          onSuccess={onUpdate}
        />
      )}
    </>
  );
}
