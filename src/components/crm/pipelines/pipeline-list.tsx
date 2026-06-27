'use client';

import { useState } from 'react';
import { Pipeline } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePipelines } from '@/hooks/crm/use-pipelines';
import {
  Edit,
  Trash2,
  MoreVertical,
  CheckCircle2,
  Circle,
  Star,
  TrendingUp,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface PipelineListProps {
  pipelines: Pipeline[];
  onEdit: (id: string) => void;
  onEditStages: (id: string) => void;
  onRefetch: () => void;
}

export function PipelineList({ pipelines, onEdit, onEditStages, onRefetch }: PipelineListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null);
  const { deletePipeline, setDefaultPipeline, updatePipeline } = usePipelines();

  const handleDeleteClick = (pipeline: Pipeline) => {
    setPipelineToDelete(pipeline);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!pipelineToDelete) return;

    try {
      await deletePipeline(pipelineToDelete._id);
      toast.success('Pipeline deleted successfully');
      setDeleteDialogOpen(false);
      setPipelineToDelete(null);
      onRefetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete pipeline');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultPipeline(id);
      toast.success('Default pipeline updated');
      onRefetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to set default pipeline');
    }
  };

  const handleToggleActive = async (pipeline: Pipeline) => {
    try {
      await updatePipeline(pipeline._id, { isActive: !pipeline.isActive });
      toast.success(`Pipeline ${pipeline.isActive ? 'deactivated' : 'activated'}`);
      onRefetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update pipeline');
    }
  };

  const getStageColor = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      orange: 'bg-orange-500',
      red: 'bg-red-500',
      purple: 'bg-purple-500',
      pink: 'bg-pink-500',
      gray: 'bg-gray-500',
    };
    return colorMap[color] || color;
  };

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Layers className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No pipelines found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create your first sales pipeline to start tracking deals through your sales process
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {pipelines.map((pipeline) => (
          <div
            key={pipeline._id}
            className="border rounded-lg p-6 hover:shadow-md transition-shadow bg-card"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold">{pipeline.name}</h3>
                  {pipeline.isDefault && (
                    <Badge variant="default" className="gap-1">
                      <Star className="size-3" />
                      Default
                    </Badge>
                  )}
                  <Badge variant={pipeline.isActive ? 'default' : 'secondary'}>
                    {pipeline.isActive ? (
                      <>
                        <CheckCircle2 className="size-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <Circle className="size-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </Badge>
                </div>
                {pipeline.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {pipeline.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="size-4" />
                    {pipeline.stages.length} stages
                  </span>
                  <span>•</span>
                  <span>Updated {formatDistanceToNow(new Date(pipeline.updatedAt), { addSuffix: true })}</span>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditStages(pipeline._id)}>
                    <Layers className="size-4 mr-2" />
                    Edit Stages
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(pipeline._id)}>
                    <Edit className="size-4 mr-2" />
                    Edit Pipeline
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleActive(pipeline)}>
                    {pipeline.isActive ? (
                      <>
                        <Circle className="size-4 mr-2" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-4 mr-2" />
                        Activate
                      </>
                    )}
                  </DropdownMenuItem>
                  {!pipeline.isDefault && pipeline.isActive && (
                    <DropdownMenuItem onClick={() => handleSetDefault(pipeline._id)}>
                      <Star className="size-4 mr-2" />
                      Set as Default
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDeleteClick(pipeline)}
                    className="text-destructive"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Visual stage flow */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground">Stages:</span>
                {pipeline.stages
                  .sort((a, b) => a.order - b.order)
                  .map((stage, index) => (
                    <div key={stage._id} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
                        <div className={`size-2 rounded-full ${getStageColor(stage.color)}`} />
                        <span className="text-sm font-medium">{stage.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {stage.probability}%
                        </span>
                      </div>
                      {index < pipeline.stages.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditStages(pipeline._id)}
              >
                <Layers className="size-4 mr-2" />
                Edit Stages
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(pipeline._id)}
              >
                <Edit className="size-4 mr-2" />
                Edit Pipeline
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{pipelineToDelete?.name}&quot;? This action cannot be undone.
              {pipelineToDelete?.isDefault && (
                <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-yellow-800 dark:text-yellow-200">
                  Warning: This is your default pipeline. You&apos;ll need to set another pipeline as default.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
