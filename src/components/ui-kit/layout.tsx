'use client';

/**
 * ui-kit · layout — page scaffolding: headers, toolbars, filter/bulk bars,
 * pagination.
 *
 * Patterns lifted from the v0.6 design mockup (removed) (dash-greet / toolbar
 * rows) + the app's proven CRM list-page chrome, generalized. Token-styled,
 * icons via lucide. Compose module pages from these — don't hand-roll the
 * title row / filter row / "N selected" bar per page.
 */

import * as React from 'react';
import { ChevronLeft, ChevronRight, FilterX, X, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button, IconButton, Chip } from './primitives';
import { Select } from './forms';

/* -------------------------------------------------------------- PageHeader */

export interface PageHeaderProps {
  /** Page title — mockup `.dash-greet` style: 21px, semibold, tight tracking. */
  title: React.ReactNode;
  /** Muted one-liner under the title. */
  sub?: React.ReactNode;
  /** Optional icon rendered in a brand-tint square before the title. */
  icon?: LucideIcon;
  /** Right-aligned action cluster (kit Buttons). */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, sub, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-muted text-brand-strong">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[21px] font-semibold tracking-[-0.02em]">{title}</h1>
          {sub ? <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Toolbar */

export interface ToolbarProps {
  /** Left cluster — filters, segmented controls, search. */
  children?: React.ReactNode;
  /** Right cluster — view toggles, secondary actions. */
  right?: React.ReactNode;
  className?: string;
}

/** The mockup's filter/action row: left + right clusters, 8px gaps. */
export function Toolbar({ children, right, className }: ToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- FilterBar */

export interface FilterBarProps {
  /** Filter controls (kit Select / SearchInput / Chips …). */
  children?: React.ReactNode;
  /** Number of active filters; shows the count chip + Clear all when > 0. */
  activeCount?: number;
  onClearAll?: () => void;
  className?: string;
}

export function FilterBar({ children, activeCount = 0, onClearAll, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {activeCount > 0 ? (
        <>
          <Chip tone="brand">{activeCount} active</Chip>
          {onClearAll ? (
            <Button variant="ghost" size="sm" icon={FilterX} onClick={onClearAll}>
              Clear all
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- BulkBar */

export interface BulkBarProps {
  /** Number of selected rows; the bar renders nothing when 0. */
  count: number;
  onClear: () => void;
  /** Action buttons operating on the selection. */
  children?: React.ReactNode;
  className?: string;
}

/** "N selected" action bar shown above a table while rows are selected. */
export function BulkBar({ count, onClear, children, className }: BulkBarProps) {
  if (count <= 0) return null;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-muted/60 px-3 py-2',
        className,
      )}
    >
      <span className="text-[13px] font-semibold text-brand-strong">
        {count} selected
      </span>
      <span className="mx-1 h-4 w-px bg-brand/20" aria-hidden />
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
      <IconButton
        icon={X}
        iconSize={15}
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-auto size-7"
      />
    </div>
  );
}

/* -------------------------------------------------------------- Pagination */

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total row count across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** When provided, renders the rows-per-page select. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <span className="text-[12.5px] tabular-nums text-muted-foreground">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select
            value={String(pageSize)}
            onChange={(v) => onPageSizeChange(Number(v))}
            options={pageSizeOptions.map((n) => ({ value: String(n), label: `${n} / page` }))}
            triggerClassName="w-[110px]"
            aria-label="Rows per page"
          />
        ) : null}
        <span className="text-[12.5px] tabular-nums text-muted-foreground">
          Page {page} of {pages}
        </span>
        <IconButton
          icon={ChevronLeft}
          iconSize={16}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="size-7 rounded-md border border-input bg-card disabled:pointer-events-none disabled:opacity-40"
        />
        <IconButton
          icon={ChevronRight}
          iconSize={16}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
          className="size-7 rounded-md border border-input bg-card disabled:pointer-events-none disabled:opacity-40"
        />
      </div>
    </div>
  );
}
