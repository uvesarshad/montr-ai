'use client';

/**
 * Left history sidebar for the unified workspace.
 *
 * Source-aware: image/video/etc come from AiStudioProject, text from the
 * Conversation model — both normalized to StudioHistoryItem and shown in one
 * list. Grouping toggle, default "By type" (buckets by kind), alternate
 * "By project" (flat, newest first). Brand-scoping happens upstream.
 *
 * Composed from the ui-kit (Button / Segmented / Spinner / ActionMenu).
 */

import React, { useMemo, useState } from 'react';
import { Archive, Clock, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button, Segmented, Spinner, ActionMenu, EmptyState } from '@/components/ui-kit';
import {
  STUDIO_MODE_META,
  STUDIO_MODE_ORDER,
  type StudioHistoryItem,
  type StudioMode,
} from './studio-meta';

type Grouping = 'type' | 'project';

interface HistorySidebarProps {
  items: StudioHistoryItem[];
  isLoading?: boolean;
  activeId: string | null;
  onSelect: (item: StudioHistoryItem) => void;
  onNew: () => void;
  onArchive: (item: StudioHistoryItem) => void;
}

function ItemRow({
  item,
  active,
  onSelect,
  onArchive,
}: {
  item: StudioHistoryItem;
  active: boolean;
  onSelect: (i: StudioHistoryItem) => void;
  onArchive: (i: StudioHistoryItem) => void;
}) {
  const meta = STUDIO_MODE_META[item.kind as StudioMode] ?? STUDIO_MODE_META.image;
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        active ? 'bg-muted' : 'hover:bg-muted/60',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded"
          style={{ background: meta.toneBg, color: meta.tone }}
        >
          <Icon className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.name || 'Untitled'}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{item.count}</span>
      </button>
      <div className="hidden group-hover:block">
        <ActionMenu
          align="end"
          items={[
            { label: 'Archive', icon: Archive, danger: true, onSelect: () => onArchive(item) },
          ]}
        />
      </div>
    </div>
  );
}

export function HistorySidebar({
  items,
  isLoading,
  activeId,
  onSelect,
  onNew,
  onArchive,
}: HistorySidebarProps) {
  const [grouping, setGrouping] = useState<Grouping>('type');

  const byType = useMemo(() => {
    const map = new Map<string, StudioHistoryItem[]>();
    for (const it of items) {
      const list = map.get(it.kind) ?? [];
      list.push(it);
      map.set(it.kind, list);
    }
    return map;
  }, [items]);

  const flat = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [items],
  );

  return (
    <aside className="flex h-full w-[244px] shrink-0 flex-col border-r border-border">
      {/* Header: New + grouping toggle */}
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <Button variant="primary" icon={Plus} onClick={onNew} className="w-full justify-center">
          New
        </Button>
        <Segmented
          className="flex w-full [&>button]:flex-1"
          options={[
            { value: 'type', label: 'By type' },
            { value: 'project', label: 'By project' },
          ]}
          value={grouping}
          onChange={(v) => setGrouping(v as Grouping)}
        />
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={Clock}
              title="No history yet"
              note="Create something to see it here."
            />
          </div>
        ) : grouping === 'type' ? (
          <div className="flex flex-col gap-3">
            {STUDIO_MODE_ORDER.map((kind) => {
              const group = byType.get(kind);
              if (!group || group.length === 0) return null;
              const meta = STUDIO_MODE_META[kind];
              return (
                <div key={kind} className="flex flex-col gap-0.5">
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    {meta.label} ({group.length})
                  </div>
                  {group.map((it) => (
                    <ItemRow
                      key={`${it.source}:${it.id}`}
                      item={it}
                      active={it.id === activeId}
                      onSelect={onSelect}
                      onArchive={onArchive}
                    />
                  ))}
                </div>
              );
            })}
            {/* Any non-mode kinds (e.g. 'mixed') fall through here */}
            {items
              .filter((it) => !(STUDIO_MODE_ORDER as string[]).includes(it.kind))
              .map((it) => (
                <ItemRow
                  key={`${it.source}:${it.id}`}
                  item={it}
                  active={it.id === activeId}
                  onSelect={onSelect}
                  onArchive={onArchive}
                />
              ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {flat.map((it) => (
              <ItemRow
                key={`${it.source}:${it.id}`}
                item={it}
                active={it.id === activeId}
                onSelect={onSelect}
                onArchive={onArchive}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
