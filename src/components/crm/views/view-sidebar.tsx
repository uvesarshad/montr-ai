'use client';

import { useState } from 'react';
import { Plus, MoreVertical, Pin, PinOff, Edit2, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { View, ViewEntityType } from '@/types/crm';
import { ViewEditor } from './view-editor';
import { useToast } from '@/hooks/use-toast';

interface ViewSidebarProps {
  views: View[];
  loading?: boolean;
  entityType: ViewEntityType;
  selectedViewId?: string;
  onViewSelect: (view: View) => void;
  onViewCreated?: (view: View) => void;
  onViewUpdated?: (view: View) => void;
  onViewDeleted?: (viewId: string) => void;
}

export function ViewSidebar({
  views,
  loading = false,
  entityType,
  selectedViewId,
  onViewSelect,
  onViewCreated,
  onViewUpdated,
  onViewDeleted,
}: ViewSidebarProps) {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<View | null>(null);

  const pinnedViews = views.filter((v) => v.isPinned && v.entityType === entityType);
  const unpinnedViews = views.filter((v) => !v.isPinned && v.entityType === entityType);
  const defaultView = views.find((v) => v.isDefault && v.entityType === entityType);

  const handleCreateView = () => {
    setEditingView(null);
    setEditorOpen(true);
  };

  const handleEditView = (view: View) => {
    setEditingView(view);
    setEditorOpen(true);
  };

  const handlePinToggle = async (view: View) => {
    try {
      const endpoint = view.isPinned ? 'unpin' : 'pin';
      const response = await fetch(`/api/v2/crm/views/${view._id}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to ${view.isPinned ? 'unpin' : 'pin'} view`);
      }

      toast({
        title: view.isPinned ? 'View unpinned' : 'View pinned',
        description: `"${view.name}" has been ${view.isPinned ? 'removed from' : 'added to'} the sidebar.`,
      });

      if (onViewUpdated) {
        const updatedView = await response.json();
        onViewUpdated(updatedView);
      }
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update view. Please try again.',
      });
    }
  };

  const handleSetDefault = async (view: View) => {
    try {
      const response = await fetch(`/api/v2/crm/views/${view._id}/default`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to set default view');
      }

      toast({
        title: 'Default view set',
        description: `"${view.name}" is now the default view.`,
      });

      if (onViewUpdated) {
        const updatedView = await response.json();
        onViewUpdated(updatedView);
      }
    } catch (error) {
      console.error('Error setting default:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to set default view. Please try again.',
      });
    }
  };

  const handleDeleteView = async (view: View) => {
    if (!confirm(`Are you sure you want to delete the view "${view.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/crm/views/${view._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete view');
      }

      toast({
        title: 'View deleted',
        description: `"${view.name}" has been successfully deleted.`,
      });

      if (onViewDeleted) {
        onViewDeleted(view._id);
      }
    } catch (error) {
      console.error('Error deleting view:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete view. Please try again.',
      });
    }
  };

  const handleViewSaved = (view: View) => {
    if (editingView) {
      onViewUpdated?.(view);
    } else {
      onViewCreated?.(view);
    }
  };

  if (loading) {
    return (
      <div className="w-64 border-r bg-muted/10">
        <div className="p-4 border-b">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-64 border-r bg-muted/10 flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={handleCreateView} className="w-full" size="sm">
            <Plus className="size-4 mr-2" />
            New View
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Pinned Views */}
            {pinnedViews.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 pb-2">
                  <Pin className="size-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Pinned Views
                  </h3>
                </div>
                {pinnedViews.map((view) => (
                  <ViewItem
                    key={view._id}
                    view={view}
                    isSelected={selectedViewId === view._id}
                    isDefault={view._id === defaultView?._id}
                    onSelect={() => onViewSelect(view)}
                    onEdit={() => handleEditView(view)}
                    onPinToggle={() => handlePinToggle(view)}
                    onSetDefault={() => handleSetDefault(view)}
                    onDelete={() => handleDeleteView(view)}
                  />
                ))}
              </div>
            )}

            {/* All Views */}
            {unpinnedViews.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 pb-2">
                  All Views
                </h3>
                {unpinnedViews.map((view) => (
                  <ViewItem
                    key={view._id}
                    view={view}
                    isSelected={selectedViewId === view._id}
                    isDefault={view._id === defaultView?._id}
                    onSelect={() => onViewSelect(view)}
                    onEdit={() => handleEditView(view)}
                    onPinToggle={() => handlePinToggle(view)}
                    onSetDefault={() => handleSetDefault(view)}
                    onDelete={() => handleDeleteView(view)}
                  />
                ))}
              </div>
            )}

            {views.filter((v) => v.entityType === entityType).length === 0 && (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-muted-foreground">
                  No views yet. Create your first view to get started.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <ViewEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        view={editingView}
        entityType={entityType}
        onSave={handleViewSaved}
      />
    </>
  );
}

interface ViewItemProps {
  view: View;
  isSelected: boolean;
  isDefault: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onPinToggle: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}

function ViewItem({
  view,
  isSelected,
  isDefault,
  onSelect,
  onEdit,
  onPinToggle,
  onSetDefault,
  onDelete,
}: ViewItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors cursor-pointer',
        isSelected && 'bg-accent'
      )}
    >
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 text-left min-w-0"
      >
        {view.icon && <span className="text-base">{view.icon}</span>}
        <span className="truncate flex-1">{view.name}</span>
        {isDefault && (
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            <Star className="size-3" />
          </Badge>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="size-4" />
            <span className="sr-only">View options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Edit2 className="size-4 mr-2" />
            Edit View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onPinToggle}>
            {view.isPinned ? (
              <>
                <PinOff className="size-4 mr-2" />
                Unpin from Sidebar
              </>
            ) : (
              <>
                <Pin className="size-4 mr-2" />
                Pin to Sidebar
              </>
            )}
          </DropdownMenuItem>
          {!isDefault && (
            <DropdownMenuItem onClick={onSetDefault}>
              <Star className="size-4 mr-2" />
              Set as Default
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="size-4 mr-2" />
            Delete View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
