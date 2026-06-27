'use client';

import { useReducer, useState } from 'react';
import { Pipeline, PipelineStage, PipelineStageType } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';

interface StageEditorProps {
  pipeline: Pipeline;
  onCancel: () => void;
  onSuccess: () => void;
}

interface StageFormData {
  _id?: string;
  name: string;
  color: string;
  probability: number;
  type: PipelineStageType;
  order: number;
  rottenDays?: number;
}

const stageColors = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
];

function SortableStageItem({ stage, onEdit, onDelete, isWonStage, isLastStage }: {
  stage: PipelineStage;
  onEdit: () => void;
  onDelete: () => void;
  isWonStage: boolean;
  isLastStage: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const colorClass = stageColors.find(c => c.value === stage.color)?.class || stage.color;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={`size-3 rounded-full ${colorClass}`} />
            <span className="font-medium">{stage.name}</span>
            {stage.type === 'won' && (
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                Won
              </span>
            )}
            {stage.type === 'lost' && (
              <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded">
                Lost
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Probability: {stage.probability}%</span>
            <span>•</span>
            <span>Type: {stage.type}</span>
            {stage.rottenDays && (
              <>
                <span>•</span>
                <span>Rotten after: {stage.rottenDays} days</span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isWonStage || isLastStage}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {(isWonStage || isLastStage) && (
        <p className="text-xs text-muted-foreground mt-2 ml-8">
          {isWonStage ? 'Won stages cannot be deleted' : 'Cannot delete the last stage'}
        </p>
      )}
    </div>
  );
}

function StageEditForm({
  editingStage,
  isAddingNew,
  dealRotting,
  wonStageCount,
  onChange,
  onSave,
  onCancel,
}: {
  editingStage: StageFormData;
  isAddingNew: boolean;
  dealRotting: boolean;
  wonStageCount: number;
  onChange: (next: StageFormData) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 bg-muted/50">
      <h4 className="font-medium mb-4">{isAddingNew ? 'Add New Stage' : 'Edit Stage'}</h4>
      <div className="grid gap-4">
        <div>
          <Label htmlFor="stage-name">Stage Name *</Label>
          <Input
            id="stage-name"
            value={editingStage.name}
            onChange={(e) => onChange({ ...editingStage, name: e.target.value })}
            placeholder="e.g., Qualified"
          />
        </div>

        <div>
          <Label htmlFor="stage-color">Color</Label>
          <Select
            value={editingStage.color}
            onValueChange={(value) => onChange({ ...editingStage, color: value })}
          >
            <SelectTrigger id="stage-color">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stageColors.map((color) => (
                <SelectItem key={color.value} value={color.value}>
                  <div className="flex items-center gap-2">
                    <div className={`size-3 rounded-full ${color.class}`} />
                    <span>{color.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="stage-probability">Probability (%)</Label>
          <Input
            id="stage-probability"
            type="number"
            min="0"
            max="100"
            value={editingStage.probability}
            onChange={(e) => onChange({ ...editingStage, probability: parseInt(e.target.value) || 0 })}
          />
        </div>

        <div>
          <Label htmlFor="stage-type">Type *</Label>
          <Select
            value={editingStage.type}
            onValueChange={(value: PipelineStageType) => onChange({ ...editingStage, type: value })}
          >
            <SelectTrigger id="stage-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open (In Progress)</SelectItem>
              <SelectItem value="won" disabled={wonStageCount >= 1 && editingStage.type !== 'won'}>
                Won (Closed-Won)
              </SelectItem>
              <SelectItem value="lost">Lost (Closed-Lost)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dealRotting && (
          <div>
            <Label htmlFor="stage-rotten-days">Rotten Days (optional)</Label>
            <Input
              id="stage-rotten-days"
              type="number"
              min="0"
              value={editingStage.rottenDays || ''}
              onChange={(e) => onChange({ ...editingStage, rottenDays: parseInt(e.target.value) || undefined })}
              placeholder="Days before deal is considered rotten"
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" onClick={onSave} size="sm">
            <Save className="size-4 mr-2" />
            Save Stage
          </Button>
          <Button type="button" onClick={onCancel} variant="outline" size="sm">
            <X className="size-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

interface UiState {
  editingStage: StageFormData | null;
  isAddingNew: boolean;
  deleteDialogOpen: boolean;
  stageToDelete: PipelineStage | null;
}

type UiAction =
  | { type: 'addStage'; stage: StageFormData }
  | { type: 'editStage'; stage: StageFormData }
  | { type: 'change'; stage: StageFormData }
  | { type: 'closeForm' }
  | { type: 'openDelete'; stage: PipelineStage }
  | { type: 'setDeleteOpen'; open: boolean }
  | { type: 'closeDelete' };

const initialUiState: UiState = {
  editingStage: null,
  isAddingNew: false,
  deleteDialogOpen: false,
  stageToDelete: null,
};

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'addStage':
      return { ...state, editingStage: action.stage, isAddingNew: true };
    case 'editStage':
      return { ...state, editingStage: action.stage, isAddingNew: false };
    case 'change':
      return { ...state, editingStage: action.stage };
    case 'closeForm':
      return { ...state, editingStage: null, isAddingNew: false };
    case 'openDelete':
      return { ...state, stageToDelete: action.stage, deleteDialogOpen: true };
    case 'setDeleteOpen':
      return { ...state, deleteDialogOpen: action.open };
    case 'closeDelete':
      return { ...state, deleteDialogOpen: false, stageToDelete: null };
    default:
      return state;
  }
}

export function StageEditor({ pipeline, onCancel, onSuccess }: StageEditorProps) {
  const [stages, setStages] = useState<PipelineStage[]>(
    [...pipeline.stages].sort((a, b) => a.order - b.order)
  );
  const [ui, dispatchUi] = useReducer(uiReducer, initialUiState);
  const { editingStage, isAddingNew, deleteDialogOpen, stageToDelete } = ui;
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStages((items) => {
        const oldIndex = items.findIndex(item => item._id === active.id);
        const newIndex = items.findIndex(item => item._id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        // Update order values
        return newItems.map((item, index) => ({ ...item, order: index }));
      });
    }
  };

  const handleAddStage = () => {
    dispatchUi({
      type: 'addStage',
      stage: {
        name: '',
        color: 'blue',
        probability: 0,
        type: 'open',
        order: stages.length,
      },
    });
  };

  const handleEditStage = (stage: PipelineStage) => {
    dispatchUi({
      type: 'editStage',
      stage: {
        _id: stage._id,
        name: stage.name,
        color: stage.color,
        probability: stage.probability,
        type: stage.type,
        order: stage.order,
        rottenDays: stage.rottenDays,
      },
    });
  };

  const handleSaveStage = () => {
    if (!editingStage) return;

    // Validation
    if (!editingStage.name.trim()) {
      toast.error('Stage name is required');
      return;
    }

    // Check for duplicate names
    const isDuplicate = stages.some(
      s => s.name.toLowerCase() === editingStage.name.toLowerCase() && s._id !== editingStage._id
    );
    if (isDuplicate) {
      toast.error('A stage with this name already exists');
      return;
    }

    if (isAddingNew) {
      // Add new stage
      const newStage: PipelineStage = {
        _id: nanoid(),
        name: editingStage.name,
        color: editingStage.color,
        probability: editingStage.probability,
        type: editingStage.type,
        order: stages.length,
        rottenDays: editingStage.rottenDays,
      };
      setStages([...stages, newStage]);
      toast.success('Stage added');
    } else {
      // Update existing stage
      setStages(stages.map(s =>
        s._id === editingStage._id
          ? { ...s, ...editingStage }
          : s
      ));
      toast.success('Stage updated');
    }

    dispatchUi({ type: 'closeForm' });
  };

  const handleDeleteClick = (stage: PipelineStage) => {
    dispatchUi({ type: 'openDelete', stage });
  };

  const handleDeleteConfirm = () => {
    if (!stageToDelete) return;

    setStages(stages.filter(s => s._id !== stageToDelete._id).map((s, index) => ({
      ...s,
      order: index,
    })));
    toast.success('Stage deleted');
    dispatchUi({ type: 'closeDelete' });
  };

  const handleSaveChanges = async () => {
    // Validation
    if (stages.length < 2) {
      toast.error('Pipeline must have at least 2 stages');
      return;
    }

    const wonStages = stages.filter(s => s.type === 'won');
    if (wonStages.length !== 1) {
      toast.error('Pipeline must have exactly 1 "won" stage');
      return;
    }

    const lostStages = stages.filter(s => s.type === 'lost');
    if (lostStages.length > 1) {
      toast.error('Pipeline can have at most 1 "lost" stage');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/v2/crm/pipelines/${pipeline._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stages }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update stages');
      }

      toast.success('Stages updated successfully');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update stages');
    } finally {
      setSaving(false);
    }
  };

  const wonStageCount = stages.filter(s => s.type === 'won').length;

  return (
    <div className="space-y-6">
      <Button type="button" onClick={handleAddStage} variant="outline" className="w-full">
        <Plus className="size-4 mr-2" />
        Add Stage
      </Button>

      {editingStage && (
        <StageEditForm
          editingStage={editingStage}
          isAddingNew={isAddingNew}
          dealRotting={pipeline.dealRotting}
          wonStageCount={wonStageCount}
          onChange={(stage) => dispatchUi({ type: 'change', stage })}
          onSave={handleSaveStage}
          onCancel={() => dispatchUi({ type: 'closeForm' })}
        />
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">
          Drag to reorder stages ({stages.length} total)
        </h4>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stages.map(s => s._id)}
            strategy={verticalListSortingStrategy}
          >
            {stages.map((stage) => (
              <SortableStageItem
                key={stage._id}
                stage={stage}
                onEdit={() => handleEditStage(stage)}
                onDelete={() => handleDeleteClick(stage)}
                isWonStage={stage.type === 'won'}
                isLastStage={stages.length === 1}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSaveChanges} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => dispatchUi({ type: 'setDeleteOpen', open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the &quot;{stageToDelete?.name}&quot; stage?
              <br />
              <span className="text-destructive">
                Warning: Deals in this stage will need to be moved manually.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
