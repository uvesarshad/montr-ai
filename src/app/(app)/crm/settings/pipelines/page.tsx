'use client';

import { useReducer, useState } from 'react';
import { PipelineList } from '@/components/crm/pipelines/pipeline-list';
import { PipelineForm } from '@/components/crm/pipelines/pipeline-form';
import { StageEditor } from '@/components/crm/pipelines/stage-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ModuleShell } from '@/components/shell/module-shell';
import { Plus, Search, GitBranch } from 'lucide-react';
import { usePipelines } from '@/hooks/crm/use-pipelines';

interface PipelineEditorState {
  formSheetOpen: boolean;
  stageEditorOpen: boolean;
  editingPipelineId: string | null;
  stagesEditingPipelineId: string | null;
}

type PipelineEditorAction =
  | { type: 'create' }
  | { type: 'edit'; id: string }
  | { type: 'editStages'; id: string }
  | { type: 'setFormOpen'; open: boolean }
  | { type: 'setStageEditorOpen'; open: boolean }
  | { type: 'closeForm' }
  | { type: 'closeStageEditor' };

const initialPipelineEditorState: PipelineEditorState = {
  formSheetOpen: false,
  stageEditorOpen: false,
  editingPipelineId: null,
  stagesEditingPipelineId: null,
};

function pipelineEditorReducer(
  state: PipelineEditorState,
  action: PipelineEditorAction,
): PipelineEditorState {
  switch (action.type) {
    case 'create':
      return { ...state, editingPipelineId: null, formSheetOpen: true };
    case 'edit':
      return { ...state, editingPipelineId: action.id, formSheetOpen: true };
    case 'editStages':
      return { ...state, stagesEditingPipelineId: action.id, stageEditorOpen: true };
    case 'setFormOpen':
      return { ...state, formSheetOpen: action.open };
    case 'setStageEditorOpen':
      return { ...state, stageEditorOpen: action.open };
    case 'closeForm':
      return { ...state, formSheetOpen: false, editingPipelineId: null };
    case 'closeStageEditor':
      return { ...state, stageEditorOpen: false, stagesEditingPipelineId: null };
    default:
      return state;
  }
}

export default function PipelinesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [{ formSheetOpen, stageEditorOpen, editingPipelineId, stagesEditingPipelineId }, dispatchEditor] =
    useReducer(pipelineEditorReducer, initialPipelineEditorState);

  const { pipelines, refetch } = usePipelines();

  const editingPipeline = pipelines.find(p => p._id === editingPipelineId);
  const stagesEditingPipeline = pipelines.find(p => p._id === stagesEditingPipelineId);

  const handleCreate = () => {
    dispatchEditor({ type: 'create' });
  };

  const handleEdit = (id: string) => {
    dispatchEditor({ type: 'edit', id });
  };

  const handleEditStages = (id: string) => {
    dispatchEditor({ type: 'editStages', id });
  };

  const handleFormClose = () => {
    dispatchEditor({ type: 'closeForm' });
    refetch();
  };

  const handleStageEditorClose = () => {
    dispatchEditor({ type: 'closeStageEditor' });
    refetch();
  };

  // Filter pipelines based on search
  const filteredPipelines = pipelines.filter(pipeline => {
    if (!searchQuery) return true;
    return pipeline.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pipeline.description?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filterBar = (
    <div className="flex items-center gap-2">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search pipelines..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 pl-8"
        />
      </div>
    </div>
  );

  const pipelinesPrimaryAction = (
    <Button size="sm" onClick={handleCreate}>
      <Plus className="size-4 mr-2" />
      New Pipeline
    </Button>
  );

  return (
    <ModuleShell
      title="Pipelines"
      icon={GitBranch}
      meta="Manage your sales pipelines and stages"
      primaryAction={pipelinesPrimaryAction}
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <PipelineList
        pipelines={filteredPipelines}
        onEdit={handleEdit}
        onEditStages={handleEditStages}
        onRefetch={refetch}
      />

      <Sheet open={formSheetOpen} onOpenChange={(open) => dispatchEditor({ type: 'setFormOpen', open })}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingPipelineId ? 'Edit Pipeline' : 'Create Pipeline'}</SheetTitle>
            <SheetDescription>
              {editingPipelineId
                ? 'Update your pipeline configuration'
                : 'Create a new sales pipeline with custom stages'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <PipelineForm
              pipelineId={editingPipelineId || undefined}
              initialData={editingPipeline}
              onCancel={handleFormClose}
              onSuccess={handleFormClose}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={stageEditorOpen} onOpenChange={(open) => dispatchEditor({ type: 'setStageEditorOpen', open })}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Stages: {stagesEditingPipeline?.name}</SheetTitle>
            <SheetDescription>
              Add, edit, remove, and reorder the stages in this pipeline
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {stagesEditingPipeline && (
              <StageEditor
                pipeline={stagesEditingPipeline}
                onCancel={handleStageEditorClose}
                onSuccess={handleStageEditorClose}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </ModuleShell>
  );
}
