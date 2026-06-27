'use client';

import Image from 'next/image';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { AlertTriangle, Clock3, MoreHorizontal, Timer, Workflow } from 'lucide-react';

import { Chip } from '@/components/ui-kit';
import { RenameCanvasDialog } from '@/components/rename-canvas-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Canvas } from '@/hooks/use-canvases-v2';
import type { CanvasScheduleSummary } from '@/components/canvas-card';
import { cn } from '@/lib/utils';

interface CanvasListRowProps {
  canvas: Canvas;
  /** Schedule visibility (TODO 2.17). */
  schedule?: CanvasScheduleSummary;
  isSelected?: boolean;
  onSelect?: (checked: boolean | 'indeterminate') => void;
  onRename?: (canvasId: string, newName: string) => void | Promise<void>;
  onDeleteSuccess?: (canvasId: string) => void | Promise<void>;
}

function getRelativeTime(value?: string | Date) {
  if (!value) return 'Never';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function CanvasListRow({
  canvas,
  schedule,
  isSelected = false,
  onSelect,
  onRename,
  onDeleteSuccess,
}: CanvasListRowProps) {
  const runCount = canvas.stats?.executionCount || 0;
  const isActive = Boolean(canvas.stats?.isActive);
  const updatedLabel = getRelativeTime(canvas.updatedAt);
  const lastRunAtValue = schedule?.lastRunAt ?? canvas.stats?.lastExecutedAt;
  const lastRunLabel = lastRunAtValue ? getRelativeTime(lastRunAtValue) : 'Never run';
  const nextRunRelative = schedule?.nextRunAt ? getRelativeTime(schedule.nextRunAt) : null;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-[10px] border border-transparent px-3 py-2.5 transition-colors',
        'hover:border-border hover:bg-muted/50',
        isSelected && 'border-brand/40 bg-brand-muted/40',
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked: CheckedState) => onSelect?.(checked)}
        className={cn(
          'size-3.5 rounded-[4px] border-[1.5px] transition-opacity data-[state=checked]:border-brand data-[state=checked]:bg-brand',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      />

      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-[8px]">
        {canvas.previewUrl ? (
          <Image src={canvas.previewUrl} alt="" width={30} height={30} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-[8px] bg-brand-muted text-brand-strong">
            <Workflow className="size-3.5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/canvas/${canvas._id}`}
            className="truncate text-[12.5px] font-semibold text-foreground transition-colors hover:text-brand"
          >
            {canvas.name}
          </Link>
          <span className="hidden sm:inline-flex">
            <Chip tone={isActive ? 'ok' : 'gray'}>{isActive ? 'Active' : 'Draft'}</Chip>
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
          <span>Updated {updatedLabel}</span>
          <span className="hidden sm:inline">•</span>
          <span>{runCount} runs</span>
          {nextRunRelative && (
            <span className="hidden items-center gap-1 text-info sm:inline-flex">
              <Timer className="size-3" />
              Next {nextRunRelative}
            </span>
          )}
          {schedule?.stalled && (
            <span className="inline-flex">
              <Chip tone="warn" icon={AlertTriangle}>
                Stalled
              </Chip>
            </span>
          )}
        </div>
      </div>

      <div className="hidden text-muted-foreground lg:block">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Last run</p>
        <p className="mt-1 truncate text-[12px] font-semibold text-foreground" title={lastRunLabel}>
          {lastRunLabel}
        </p>
      </div>

      <div className="hidden text-muted-foreground lg:block">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Updated</p>
        <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-foreground">
          <Clock3 className="size-3 text-muted-foreground" />
          {updatedLabel}
        </p>
      </div>

      <RenameCanvasDialog
        canvasId={canvas._id}
        currentName={canvas.name}
        onRename={onRename}
        onDeleteSuccess={onDeleteSuccess}
      >
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Manage ${canvas.name}`}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </RenameCanvasDialog>
    </div>
  );
}
