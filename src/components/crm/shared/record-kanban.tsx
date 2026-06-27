'use client';

/**
 * RecordKanban — a generalized, Twenty-style kanban board for any CRM entity,
 * grouped by any "select-ish" field (status / lifecycle / priority / type /
 * industry / owner …). This is the shared, field-agnostic counterpart to the
 * deals-by-stage `DealKanban` (which stays as-is for pipeline stages).
 *
 * Pragmatic v1: purely client-side over an already-fetched page of records
 * (mirrors how `CrmDataGrid` grouping works). Columns can be supplied for a
 * known enum (so empty columns still render) or derived from the data.
 *
 * Drag-and-drop mirrors the deals kanban: `@dnd-kit/core` + `@dnd-kit/sortable`
 * (PointerSensor, closestCorners, DragOverlay). DnD is only enabled when an
 * `onMoveItem` handler is provided.
 */

import * as React from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';

import { Chip } from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

/** Sentinel column for records whose group value is empty/undefined. */
const UNASSIGNED = '__unassigned__';

export interface RecordKanbanColumn {
  value: string;
  label: string;
  /** Optional dot color (hex/css). */
  color?: string;
  /** Optional chip tone for the column header count. */
  tone?: ChipTone;
}

export interface RecordKanbanAggregate {
  /** Numeric field on each item to sum (e.g. deal `value`). */
  sumKey: string;
  /** Formats the column total (e.g. currency). */
  format: (total: number) => string;
}

export interface RecordKanbanProps<T> {
  items: T[];
  /** Field used to bucket items into columns. */
  groupKey: keyof T & string;
  /**
   * Known enum columns (renders empty columns too). When omitted, columns are
   * derived from the distinct values present in `items`.
   */
  columns?: RecordKanbanColumn[];
  /** Stable id for an item. */
  getId: (item: T) => string;
  /** Primary card label. */
  getLabel: (item: T) => React.ReactNode;
  /** Optional secondary card line. */
  getSubtitle?: (item: T) => React.ReactNode;
  /**
   * Resolves the raw group value for an item. Defaults to reading `item[groupKey]`
   * (handles populated owner objects via this override on the consumer side).
   */
  getGroupValue?: (item: T) => string | undefined;
  /** Per-column count + numeric aggregate footer (e.g. sum of deal value). */
  aggregate?: RecordKanbanAggregate;
  onItemClick?: (item: T) => void;
  /**
   * Persists a move. When provided, drag-and-drop is enabled; the board
   * optimistically reorders and calls this with the destination column value.
   */
  onMoveItem?: (item: T, toColumnValue: string) => Promise<void>;
  /** Optional note shown above the board (e.g. "Showing first 25 of 120"). */
  note?: React.ReactNode;
  className?: string;
}

/* ---------------------------------------------------------------- card */

interface CardProps<T> {
  item: T;
  id: string;
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  onClick?: (item: T) => void;
  draggable: boolean;
}

function KanbanCard<T>({ item, id, label, subtitle, onClick, draggable }: CardProps<T>) {
  const sortable = useSortable({ id, disabled: !draggable });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(item)}
      className={cn(
        'rounded-lg border border-border bg-card p-3 text-left shadow-sm transition',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        'hover:border-input hover:shadow-card-hover',
      )}
    >
      <div className="truncate text-[13px] font-medium">{label}</div>
      {subtitle ? (
        <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- column */

interface ColumnProps<T> {
  column: RecordKanbanColumn;
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => React.ReactNode;
  getSubtitle?: (item: T) => React.ReactNode;
  aggregate?: RecordKanbanAggregate;
  onItemClick?: (item: T) => void;
  draggable: boolean;
}

function KanbanColumn<T>({
  column,
  items,
  getId,
  getLabel,
  getSubtitle,
  aggregate,
  onItemClick,
  draggable,
}: ColumnProps<T>) {
  const { setNodeRef, isOver } = useDroppable({ id: column.value, disabled: !draggable });

  const total = React.useMemo(() => {
    if (!aggregate) return 0;
    return items.reduce((sum, it) => {
      const raw = (it as Record<string, unknown>)[aggregate.sumKey];
      return sum + (typeof raw === 'number' ? raw : 0);
    }, 0);
  }, [items, aggregate]);

  return (
    <div className="flex h-full w-72 flex-shrink-0 flex-col">
      {/* Header */}
      <div className="mb-2.5 space-y-1.5 px-0.5">
        <div className="flex items-center gap-2">
          {column.color ? (
            <span
              className="size-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: column.color }}
            />
          ) : null}
          <h3 className="flex-1 truncate text-[13px] font-semibold capitalize">{column.label}</h3>
          <Chip tone={column.tone ?? 'gray'}>{items.length}</Chip>
        </div>
        {aggregate && total > 0 ? (
          <div className="text-[12px] font-medium text-muted-foreground">
            {aggregate.format(total)}
          </div>
        ) : null}
      </div>

      {/* Droppable body */}
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[160px] flex-1 space-y-2 overflow-y-auto rounded-xl border p-2 transition-colors',
          isOver ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/30',
        )}
      >
        <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <KanbanCard
              key={getId(item)}
              item={item}
              id={getId(item)}
              label={getLabel(item)}
              subtitle={getSubtitle?.(item)}
              onClick={onItemClick}
              draggable={draggable}
            />
          ))}
        </SortableContext>
        {items.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-muted-foreground">No records</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- board */

export function RecordKanban<T>({
  items,
  groupKey,
  columns,
  getId,
  getLabel,
  getSubtitle,
  getGroupValue,
  aggregate,
  onItemClick,
  onMoveItem,
  note,
  className,
}: RecordKanbanProps<T>) {
  const draggable = Boolean(onMoveItem);

  const resolveGroup = React.useCallback(
    (item: T): string => {
      const raw = getGroupValue
        ? getGroupValue(item)
        : ((item as Record<string, unknown>)[groupKey] as unknown);
      const v = raw == null || raw === '' ? UNASSIGNED : String(raw);
      return v;
    },
    [getGroupValue, groupKey],
  );

  // Local copy so drag-and-drop can optimistically move cards between columns.
  const [localItems, setLocalItems] = React.useState<T[]>(items);
  React.useEffect(() => setLocalItems(items), [items]);

  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Build the column list: supplied enum columns + any extra values found in
  // data, plus an Unassigned bucket when needed.
  const resolvedColumns = React.useMemo<RecordKanbanColumn[]>(() => {
    const present = new Set(localItems.map(resolveGroup));
    const cols: RecordKanbanColumn[] = [];
    const seen = new Set<string>();

    for (const c of columns ?? []) {
      cols.push(c);
      seen.add(c.value);
    }
    // Derived values not covered by the supplied enum.
    for (const v of present) {
      if (v === UNASSIGNED || seen.has(v)) continue;
      cols.push({ value: v, label: v });
      seen.add(v);
    }
    if (present.has(UNASSIGNED)) {
      cols.push({ value: UNASSIGNED, label: 'Unassigned', tone: 'gray' });
    }
    return cols;
  }, [columns, localItems, resolveGroup]);

  const itemsByColumn = React.useMemo(() => {
    const map = new Map<string, T[]>();
    for (const c of resolvedColumns) map.set(c.value, []);
    for (const item of localItems) {
      const key = resolveGroup(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [resolvedColumns, localItems, resolveGroup]);

  const activeItem = React.useMemo(
    () => (activeId ? localItems.find((i) => getId(i) === activeId) ?? null : null),
    [activeId, localItems, getId],
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over || !draggable) return;

    const item = localItems.find((i) => getId(i) === active.id);
    if (!item) return;

    // `over.id` is either a column id (empty area) or another card id.
    const overId = over.id as string;
    let toColumn = overId;
    if (!resolvedColumns.some((c) => c.value === overId)) {
      const overItem = localItems.find((i) => getId(i) === overId);
      if (overItem) toColumn = resolveGroup(overItem);
    }

    const fromColumn = resolveGroup(item);
    if (toColumn === fromColumn || toColumn === UNASSIGNED) return;

    // Optimistic: rewrite the group field on the moved item.
    const prev = localItems;
    setLocalItems((list) =>
      list.map((i) =>
        getId(i) === getId(item) ? ({ ...i, [groupKey]: toColumn } as T) : i,
      ),
    );

    try {
      await onMoveItem!(item, toColumn);
    } catch (err) {
      setLocalItems(prev); // rollback
      toast.error(err instanceof Error ? err.message : 'Failed to move record');
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {note ? <p className="text-[12px] text-muted-foreground">{note}</p> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-3">
          {resolvedColumns.map((col) => (
            <KanbanColumn
              key={col.value}
              column={col}
              items={itemsByColumn.get(col.value) ?? []}
              getId={getId}
              getLabel={getLabel}
              getSubtitle={getSubtitle}
              aggregate={aggregate}
              onItemClick={onItemClick}
              draggable={draggable}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem ? (
            <div className="w-72 rotate-2 rounded-lg border border-border bg-card p-3 opacity-90 shadow-card-hover">
              <div className="truncate text-[13px] font-medium">{getLabel(activeItem)}</div>
              {getSubtitle ? (
                <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {getSubtitle(activeItem)}
                </div>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
