'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  RowSelectionState,
  type Table as TableType,
  type Row,
} from '@tanstack/react-table';
import { Fragment, useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Client-side row grouping config. When provided, the desktop table partitions
 * the *current page's* rows by `key` (or a custom `resolveLabel`) into
 * collapsible groups. Groups are ordered alphabetically by label, with the
 * empty group ("—") last. Cross-page groups split (acceptable v1 tradeoff).
 */
export interface CrmDataGridGroupBy<TData> {
  /** Field key read off the row when `resolveLabel` is not given. */
  key: string;
  /** Human label for the grouped field (unused in rendering, kept for callers). */
  label?: string;
  /** Resolve the display label for a row's group (e.g. owner id -> name). */
  resolveLabel?: (row: TData) => string;
  /** Numeric field to sum per group (e.g. deal "value"). */
  sumKey?: string;
  /** Format a group's summed value (e.g. currency). */
  formatSum?: (sum: number, rows: TData[]) => string;
}

const EMPTY_GROUP_LABEL = '—';

interface CrmDataGridProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  enableRowSelection?: boolean;
  enableSorting?: boolean;
  onRowSelectionChange?: (selectedRows: TData[]) => void;
  getRowId?: (row: TData) => string;
  emptyMessage?: string;
  emptyDescription?: string;
  className?: string;
  mobileCard?: (row: TData) => React.ReactNode;
  /**
   * Fired on a plain left-click of a desktop row (no modifier / middle click,
   * and not on an interactive child like a link, button or checkbox). Used to
   * open the record preview panel; ctrl/cmd/middle-click still navigate via the
   * in-cell links.
   */
  onRowClick?: (row: TData) => void;
  /**
   * When set, the desktop table renders rows partitioned into collapsible
   * groups with a header row (chevron + label + count + optional sum).
   * Client-side only — groups the current fetched page.
   */
  groupBy?: CrmDataGridGroupBy<TData>;
}

export function CrmDataGrid<TData, TValue>({
  columns,
  data,
  loading = false,
  enableRowSelection = false,
  enableSorting = true,
  onRowSelectionChange,
  getRowId,
  emptyMessage = 'No results found',
  emptyDescription = 'Try adjusting your search or filters',
  className,
  mobileCard,
  onRowClick,
  groupBy,
}: CrmDataGridProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // Local collapsed state per group label (true = collapsed).
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Add selection column if row selection is enabled
  const columnsWithSelection = enableRowSelection
    ? [
      {
        id: 'select',
        header: ({ table }: { table: TableType<TData> }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }: { row: Row<TData> }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      } as ColumnDef<TData, TValue>,
      ...columns,
    ]
    : columns;

  const table = useReactTable({
    data,
    columns: columnsWithSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    onSortingChange: enableSorting ? setSorting : undefined,
    onRowSelectionChange: setRowSelection,
    getRowId: getRowId,
    state: {
      sorting: enableSorting ? sorting : undefined,
      rowSelection,
    },
    enableRowSelection,
  });

  // Notify parent of selection changes
  useEffect(() => {
    if (onRowSelectionChange) {
      const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
      onRowSelectionChange(selectedRows);
    }
  }, [rowSelection, onRowSelectionChange, table]);

  // Sorted rows (post-sort, current page) used as the grouping source so that
  // grouping respects the active column sort.
  const sortedRows = table.getRowModel().rows;

  // Partition rows into groups (alphabetical by label, empty group last).
  const groups = useMemo(() => {
    if (!groupBy) return null;

    const labelFor = (row: Row<TData>): string => {
      if (groupBy.resolveLabel) {
        const resolved = groupBy.resolveLabel(row.original);
        return resolved && String(resolved).trim() ? String(resolved) : EMPTY_GROUP_LABEL;
      }
      const raw = (row.original as Record<string, unknown>)?.[groupBy.key];
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        return EMPTY_GROUP_LABEL;
      }
      return String(raw);
    };

    const map = new Map<string, Row<TData>[]>();
    for (const row of sortedRows) {
      const label = labelFor(row);
      const bucket = map.get(label);
      if (bucket) bucket.push(row);
      else map.set(label, [row]);
    }

    const entries = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === EMPTY_GROUP_LABEL) return 1;
      if (b === EMPTY_GROUP_LABEL) return -1;
      return a.localeCompare(b);
    });

    return entries.map(([label, rows]) => {
      let sum: number | null = null;
      if (groupBy.sumKey) {
        sum = rows.reduce((acc, r) => {
          const v = (r.original as Record<string, unknown>)[groupBy.sumKey as string];
          return acc + (typeof v === 'number' ? v : 0);
        }, 0);
      }
      const formattedSum =
        sum !== null
          ? groupBy.formatSum
            ? groupBy.formatSum(sum, rows.map((r) => r.original))
            : sum.toLocaleString()
          : null;
      return { label, rows, formattedSum };
    });
  }, [groupBy, sortedRows]);

  // Loading state
  if (loading) {
    return (
      <div className={cn('rounded-md border', className)}>
        {mobileCard && (
          <div className="sm:hidden divide-y">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className={cn(mobileCard && 'hidden sm:block')}>
        <Table>
          <TableHeader>
            <TableRow>
              {columnsWithSelection.map((column, i) => (
                <TableHead key={(column as { id?: string }).id ?? i}>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {columnsWithSelection.map((col, j) => (
                  <TableCell key={(col as { id?: string }).id ?? j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={cn('rounded-md border', className)}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6 text-muted-foreground"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="text-lg font-medium">{emptyMessage}</h3>
          <p className="text-sm text-muted-foreground mt-1">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border overflow-hidden', className)}>
      {/* Mobile card list */}
      {mobileCard && (
        <div className="sm:hidden divide-y">
          {data.map((row, i) => (
            <div key={getRowId ? getRowId(row) : i}>
              {mobileCard(row)}
            </div>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <div className={cn('overflow-x-auto', mobileCard && 'hidden sm:block')}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            'flex items-center gap-2',
                            canSort && 'cursor-pointer select-none'
                          )}
                          onClick={
                            canSort
                              ? header.column.getToggleSortingHandler()
                              : undefined
                          }
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {canSort && (
                            <span className="ml-auto">
                              {isSorted === 'asc' ? (
                                <ArrowUp className="size-4" />
                              ) : isSorted === 'desc' ? (
                                <ArrowDown className="size-4" />
                              ) : (
                                <ArrowUpDown className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {(() => {
              const colSpan = table.getAllLeafColumns().length;
              const renderRow = (row: Row<TData>) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="cursor-pointer transition-colors duration-200 hover:bg-muted/40 data-[state=selected]:bg-primary/10"
                  onClick={
                    onRowClick
                      ? (e) => {
                          // Only plain left-click; let ctrl/cmd/middle-click and
                          // interactive children (links, buttons, inputs) behave normally.
                          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                          if (
                            (e.target as HTMLElement).closest(
                              'a, button, input, label, [role="checkbox"], [role="menuitem"], [data-no-row-click]'
                            )
                          ) {
                            return;
                          }
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );

              if (groups) {
                return groups.map((group) => {
                  const collapsed = !!collapsedGroups[group.label];
                  return (
                    <Fragment key={`group-${group.label}`}>
                      <TableRow
                        className="bg-muted/40 hover:bg-muted/50"
                      >
                        <TableCell colSpan={colSpan} className="py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedGroups((prev) => ({
                                  ...prev,
                                  [group.label]: !prev[group.label],
                                }))
                              }
                              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={collapsed ? 'Expand group' : 'Collapse group'}
                              aria-expanded={!collapsed}
                            >
                              {collapsed ? (
                                <ChevronRight className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </button>
                            <span className="text-sm font-medium capitalize">{group.label}</span>
                            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {group.rows.length}
                            </span>
                            {group.formattedSum && (
                              <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
                                {group.formattedSum}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {!collapsed && group.rows.map((row) => renderRow(row))}
                    </Fragment>
                  );
                });
              }

              return sortedRows.map((row) => renderRow(row));
            })()}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
