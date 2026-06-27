'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, Search, X, List, LayoutGrid } from 'lucide-react';
import { Button, ButtonProps } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const ResourceAction = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return (
    <motion.div
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="inline-block"
    >
      <Button {...props} ref={ref} />
    </motion.div>
  );
});
ResourceAction.displayName = 'ResourceAction';

interface SortOption {
  label: string;
  value: string;
}

interface ResourceToolbarProps {
  title: React.ReactNode;
  selectedCount: number;
  onClearSelection: () => void;
  selectionActions: React.ReactNode;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  view: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
  sortOptions?: SortOption[];
  sortBy?: string;
  onSortChange?: (value: string) => void;
}

export function ResourceToolbar({
  title,
  selectedCount,
  onClearSelection,
  selectionActions,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  view,
  onViewChange,
  sortOptions,
  sortBy,
  onSortChange,
  sortLabel,
  icon,
}: ResourceToolbarProps & { icon?: React.ReactNode; sortLabel?: string }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {selectedCount > 0 ? (
            <motion.div
              key="selection"
              initial={{ opacity: 0, clipPath: 'inset(0% 100% 0% 0%)', x: -10 }}
              animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', x: 0 }}
              exit={{ opacity: 0, clipPath: 'inset(0% 100% 0% 0%)', x: -10 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-wrap items-center gap-2 rounded-[12px] border border-primary/20 bg-primary/5 px-3 py-2"
            >
              <div className="flex items-center gap-2 rounded-[10px] bg-background/80 px-2.5 py-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClearSelection}
                  className="size-6 rounded-[0.4rem] text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </Button>
                <span className="text-sm font-semibold text-foreground">
                  {selectedCount} selected
                </span>
              </div>
              <div className="hidden h-5 w-px bg-border/60 md:block" />
              <div className="flex flex-1 flex-wrap items-center gap-2">{selectionActions}</div>
            </motion.div>
          ) : (
            <motion.div
              key="title"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex min-w-0 items-center gap-2"
            >
              {icon ? (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-border/60 bg-muted/30 text-muted-foreground">
                  {icon}
                </div>
              ) : null}
              {typeof title === 'string' ? (
                <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
              ) : (
                title
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
        <div className="relative w-full sm:w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            className="h-10 rounded-[12px] border-border/60 bg-background/70 pl-9 text-sm"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        {sortOptions && onSortChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-[0.4rem] border-border/60 bg-background/70 px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowUpDown className="size-3.5" />
                {sortLabel || 'Sort'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {sortOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => onSortChange(option.value)}
                  className={cn(sortBy === option.value && 'bg-muted font-medium')}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="flex items-center rounded-[12px] border border-border/60 bg-muted/15 p-1">
          <button
            onClick={() => onViewChange('list')}
            className={cn(
              'rounded-[0.4rem] px-2 py-1.5 text-xs font-semibold transition-all',
              view === 'list'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
            title="List view"
          >
            <List className="size-4" />
          </button>
          <button
            onClick={() => onViewChange('grid')}
            className={cn(
              'rounded-[0.4rem] px-2 py-1.5 text-xs font-semibold transition-all',
              view === 'grid'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
            title="Grid view"
          >
            <LayoutGrid className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
