'use client';

import { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { View, ViewEntityType } from '@/types/crm';
import { useViews } from '@/hooks/crm/use-views';
import { ViewEditor } from './view-editor';
import { Badge } from '@/components/ui/badge';

interface ViewSelectorProps {
  entityType: ViewEntityType;
  selectedViewId?: string;
  onViewSelect: (view: View | null) => void;
  className?: string;
}

export function ViewSelector({
  entityType,
  selectedViewId,
  onViewSelect,
  className,
}: ViewSelectorProps) {
  const { views, loading, refetch } = useViews({ entityType });
  const [editorOpen, setEditorOpen] = useState(false);

  const selectedView = views.find((v) => v._id === selectedViewId);
  const defaultView = views.find((v) => v.isDefault && v.entityType === entityType);
  const pinnedViews = views.filter((v) => v.isPinned && v.entityType === entityType);
  const otherViews = views.filter((v) => !v.isPinned && v.entityType === entityType);

  const handleViewCreated = (view: View) => {
    refetch();
    onViewSelect(view);
  };

  const handleClearView = () => {
    onViewSelect(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn('w-[200px] justify-between', className)}
            disabled={loading}
          >
            <span className="truncate">
              {selectedView?.name || defaultView?.name || 'All Records'}
            </span>
            <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[250px]">
          <DropdownMenuLabel>Select View</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Default/All view */}
          <DropdownMenuItem
            onClick={handleClearView}
            className="cursor-pointer"
          >
            <Check
              className={cn(
                'mr-2 size-4',
                !selectedViewId ? 'opacity-100' : 'opacity-0'
              )}
            />
            <span className="flex-1">All Records</span>
            {defaultView && !selectedViewId && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                Default
              </Badge>
            )}
          </DropdownMenuItem>

          {/* Pinned views */}
          {pinnedViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Pinned Views
              </DropdownMenuLabel>
              {pinnedViews.map((view) => (
                <DropdownMenuItem
                  key={view._id}
                  onClick={() => onViewSelect(view)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      selectedViewId === view._id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="flex-1 truncate">{view.name}</span>
                  {view.filters.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                      {view.filters.length}
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {/* Other views */}
          {otherViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Other Views
              </DropdownMenuLabel>
              {otherViews.map((view) => (
                <DropdownMenuItem
                  key={view._id}
                  onClick={() => onViewSelect(view)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      selectedViewId === view._id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="flex-1 truncate">{view.name}</span>
                  {view.filters.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                      {view.filters.length}
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setEditorOpen(true)}
            className="cursor-pointer"
          >
            <Plus className="mr-2 size-4" />
            Create New View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ViewEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        entityType={entityType}
        onSave={handleViewCreated}
      />
    </>
  );
}
