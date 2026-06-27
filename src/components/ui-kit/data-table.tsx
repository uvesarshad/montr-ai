'use client';

/**
 * ui-kit · data-table — the full-featured data grid: sorting, row selection,
 * row click, loading skeleton, empty state, mobile card fallback.
 *
 * Built on @tanstack/react-table, generalized from the proven CRM grid and
 * styled to match the kit `Table` surface (10.5px uppercase headers, 44px
 * rows, brand-muted selection). For simple read-only grids the lightweight
 * `Table` in surfaces.tsx is still fine; reach for `DataTable` when you need
 * behaviour.
 *
 * Pair with `BulkBar` + `Pagination` from layout.tsx for full list pages.
 */

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, Skeleton } from './surfaces';

// Column value types vary per column; `any` mirrors the TanStack idiom.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData> = ColumnDef<TData, any>;

export interface DataTableProps<TData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  loading?: boolean;
  skeletonRows?: number;
  /** Adds the leading checkbox column. */
  enableRowSelection?: boolean;
  /** Fires with the selected row objects whenever selection changes. */
  onRowSelectionChange?: (rows: TData[]) => void;
  /**
   * Controlled selection state (TanStack `RowSelectionState`). Pass `{}` to
   * clear from outside (e.g. BulkBar's ✕); omit for uncontrolled.
   */
  rowSelection?: RowSelectionState;
  onRowSelectionStateChange?: (state: RowSelectionState) => void;
  enableSorting?: boolean;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  /** Empty-state override; defaults to a kit EmptyState. */
  empty?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyNote?: React.ReactNode;
  /** Mobile fallback: renders a card list under `sm` instead of the table. */
  mobileCard?: (row: TData) => React.ReactNode;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  loading = false,
  skeletonRows = 6,
  enableRowSelection = false,
  onRowSelectionChange,
  rowSelection: controlledSelection,
  onRowSelectionStateChange,
  enableSorting = true,
  onRowClick,
  getRowId,
  empty,
  emptyTitle = 'No results found',
  emptyNote = 'Try adjusting your search or filters.',
  mobileCard,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = React.useState<RowSelectionState>({});
  const rowSelection = controlledSelection ?? internalSelection;

  const setRowSelection = React.useCallback(
    (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      if (controlledSelection === undefined) setInternalSelection(next);
      onRowSelectionStateChange?.(next);
    },
    [controlledSelection, onRowSelectionStateChange, rowSelection],
  );

  const allColumns = React.useMemo<DataTableColumn<TData>[]>(() => {
    if (!enableRowSelection) return columns;
    const select: DataTableColumn<TData> = {
      id: 'select',
      size: 36,
      header: ({ table }: { table: TanstackTable<TData> }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }: { row: Row<TData> }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
    };
    return [select, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    onSortingChange: enableSorting ? setSorting : undefined,
    onRowSelectionChange: setRowSelection,
    getRowId,
    state: { sorting: enableSorting ? sorting : undefined, rowSelection },
    enableRowSelection,
  });

  // Surface the selected row objects to the parent.
  React.useEffect(() => {
    onRowSelectionChange?.(table.getSelectedRowModel().rows.map((r) => r.original));
  }, [rowSelection, onRowSelectionChange, table]);

  const headCls =
    'whitespace-nowrap border-b border-border bg-card px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground';

  if (loading) {
    return (
      <div className={className}>
        {mobileCard ? (
          <div className="divide-y divide-border sm:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className={cn('w-full overflow-x-auto', mobileCard && 'hidden sm:block')}>
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {allColumns.map((_, i) => (
                  <th key={i} className={headCls}>
                    <Skeleton className="h-3.5 w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: skeletonRows }).map((_, ri) => (
                <tr key={ri} className="border-b border-border">
                  {allColumns.map((_, ci) => (
                    <td key={ci} className="h-[var(--row-h,44px)] px-3">
                      <Skeleton className="h-3.5 w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={className}>
        {empty ?? <EmptyState icon={Inbox} title={emptyTitle} note={emptyNote} />}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Mobile card list */}
      {mobileCard ? (
        <div className="divide-y divide-border sm:hidden">
          {table.getRowModel().rows.map((row) => (
            <div key={row.id}>{mobileCard(row.original)}</div>
          ))}
        </div>
      ) : null}

      {/* Desktop table */}
      <div className={cn('w-full overflow-x-auto', mobileCard && 'hidden sm:block')}>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      className={cn('sticky top-0 z-[1]', headCls)}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn('flex items-center gap-1.5', canSort && 'cursor-pointer select-none')}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort ? (
                            sorted === 'asc' ? (
                              <ArrowUp className="size-3" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-40" />
                            )
                          ) : null}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  'border-b border-border transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-muted/60',
                  row.getIsSelected() && 'bg-brand-muted',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="h-[var(--row-h,44px)] whitespace-nowrap px-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
