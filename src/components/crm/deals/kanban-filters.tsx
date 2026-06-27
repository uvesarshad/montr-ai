'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { OwnerSelector } from '@/components/crm/shared/owner-selector';
import { TagSelector } from '@/components/crm/shared/tag-selector';
import { Filter, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KanbanFiltersState {
  search: string;
  ownerId?: string;
  priority?: string;
  tags: string[];
}

interface KanbanFiltersProps {
  filters: KanbanFiltersState;
  onChange: (filters: KanbanFiltersState) => void;
  className?: string;
}

export function KanbanFilters({ filters, onChange, className }: KanbanFiltersProps) {
  const [open, setOpen] = useState(false);

  const updateFilter = (key: keyof KanbanFiltersState, value: unknown) => {
    onChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onChange({
      search: '',
      ownerId: undefined,
      priority: undefined,
      tags: [],
    });
  };

  const hasActiveFilters =
    filters.ownerId || filters.priority || filters.tags.length > 0;

  const activeFilterCount =
    (filters.ownerId ? 1 : 0) +
    (filters.priority ? 1 : 0) +
    (filters.tags.length > 0 ? 1 : 0);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search deals..."
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Advanced Filters Popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Filters</h4>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Owner Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Owner</label>
              <OwnerSelector
                value={filters.ownerId}
                onChange={(value) => updateFilter('ownerId', value)}
              />
            </div>

            {/* Priority Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select
                value={filters.priority || ''}
                onValueChange={(value) =>
                  updateFilter('priority', value || undefined)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <TagSelector
                value={filters.tags}
                onChange={(value) => updateFilter('tags', value)}
                // @ts-expect-error
                multiple
                entityType="deal"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          {filters.ownerId && (
            <Badge variant="secondary" className="gap-1">
              Owner
              <button
                type="button"
                onClick={() => updateFilter('ownerId', undefined)}
                className="ml-1 rounded-full hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {filters.priority && (
            <Badge variant="secondary" className="gap-1">
              {filters.priority}
              <button
                type="button"
                onClick={() => updateFilter('priority', undefined)}
                className="ml-1 rounded-full hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {filters.tags.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              {filters.tags.length} {filters.tags.length === 1 ? 'tag' : 'tags'}
              <button
                type="button"
                onClick={() => updateFilter('tags', [])}
                className="ml-1 rounded-full hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
