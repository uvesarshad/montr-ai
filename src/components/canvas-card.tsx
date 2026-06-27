'use client';

import Image from 'next/image';
import Link from 'next/link';
import { MouseEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { AlertTriangle, CheckCircle2, Clock3, MoreHorizontal, Play, Timer, Workflow, XCircle } from 'lucide-react';

import { Card, Chip } from '@/components/ui-kit';
import { RenameCanvasDialog } from '@/components/rename-canvas-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface CanvasScheduleSummary {
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
  intervalMs: number | null;
  stalled: boolean;
}

interface CanvasCardProps {
  canvas: {
    _id: string;
    name: string;
    updatedAt?: string | Date;
    previewUrl?: string;
    stats?: {
      executionCount: number;
      isActive: boolean;
      lastExecutedAt?: string;
    };
  };
  /** Schedule visibility (TODO 2.17): last/next run + stalled. */
  schedule?: CanvasScheduleSummary;
  isSelected?: boolean;
  onSelect?: (checked: boolean | 'indeterminate') => void;
  showSelection?: boolean;
  onRename?: (canvasId: string, newName: string) => void | Promise<void>;
  onDeleteSuccess?: (canvasId: string) => void | Promise<void>;
}

function getRelativeTime(value?: string | Date) {
  if (!value) return 'No edits yet';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

const RUN_STATUS_TONE: Record<string, { tone: 'ok' | 'danger' | 'gray'; Icon: typeof CheckCircle2; label: string }> = {
  completed: { tone: 'ok', Icon: CheckCircle2, label: 'Success' },
  failed: { tone: 'danger', Icon: XCircle, label: 'Failed' },
  cancelled: { tone: 'gray', Icon: XCircle, label: 'Cancelled' },
};

export function CanvasCard({
  canvas,
  schedule,
  isSelected = false,
  onSelect,
  showSelection = false,
  onRename,
  onDeleteSuccess,
}: CanvasCardProps) {
  const runCount = canvas.stats?.executionCount || 0;
  const isActive = Boolean(canvas.stats?.isActive);
  // Prefer the schedule endpoint's last-run (execution-derived) when present,
  // falling back to the workflow's stored lastExecutedAt.
  const lastRunAtValue = schedule?.lastRunAt ?? canvas.stats?.lastExecutedAt;
  const lastExecutedAt = lastRunAtValue ? getRelativeTime(lastRunAtValue) : 'Never run';
  const lastStatusMeta = schedule?.lastRunStatus
    ? RUN_STATUS_TONE[schedule.lastRunStatus]
    : undefined;
  const nextRunRelative = schedule?.nextRunAt ? getRelativeTime(schedule.nextRunAt) : null;

  const handleCheckboxChange = (checked: CheckedState) => {
    onSelect?.(checked);
  };

  const handleCheckboxClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Card
      lift
      className={cn('group relative', isSelected && 'border-brand ring-2 ring-brand/25')}
      bodyClassName="flex flex-col"
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-border bg-muted/40">
        <Link href={`/canvas/${canvas._id}`} className="absolute inset-0">
          {canvas.previewUrl ? (
            <Image
              src={canvas.previewUrl}
              alt={canvas.name || 'Canvas preview'}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,hsl(var(--brand-muted)),transparent_55%)]">
              <span className="grid size-11 place-items-center rounded-[12px] bg-brand-muted text-brand-strong">
                <Workflow className="size-5" />
              </span>
            </div>
          )}
        </Link>

        {showSelection ? (
          <div className="absolute left-2.5 top-2.5 z-[2]" onClick={handleCheckboxClick}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              className={cn(
                'size-4 rounded-[5px] border-[1.5px] bg-card/90 shadow-sm transition-opacity data-[state=checked]:border-brand data-[state=checked]:bg-brand',
                !isSelected && 'opacity-0 group-hover:opacity-100',
              )}
            />
          </div>
        ) : null}

        <div className="absolute right-2.5 top-2.5 z-[2]">
          <Chip tone={isActive ? 'ok' : 'gray'} dot>
            {isActive ? 'Active' : 'Draft'}
          </Chip>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-[2] flex items-center justify-between border-t border-border bg-card/85 px-2.5 py-1.5 text-[10.5px] text-muted-foreground backdrop-blur-md">
          <span className="inline-flex items-center gap-1">
            <Play className="size-3" />
            {runCount} runs
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" />
            {lastExecutedAt}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/canvas/${canvas._id}`}
              className="block truncate text-[13px] font-bold leading-[1.3] text-foreground transition-colors hover:text-brand"
            >
              {canvas.name}
            </Link>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Updated {getRelativeTime(canvas.updatedAt)}
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
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
              aria-label={`Manage ${canvas.name}`}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </RenameCanvasDialog>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-[8px] border border-border bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</p>
            <p className="mt-1 text-[12.5px] font-bold text-foreground">{isActive ? 'Live' : 'Idle'}</p>
          </div>
          <div className="rounded-[8px] border border-border bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Runs</p>
            <p className="mt-1 text-[12.5px] font-bold tabular-nums text-foreground">{runCount}</p>
          </div>
          <div className="rounded-[8px] border border-border bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Last run</p>
            <p className="mt-1 truncate text-[12.5px] font-bold text-foreground" title={lastExecutedAt}>
              {lastExecutedAt}
            </p>
          </div>
        </div>

        {/* Schedule visibility (TODO 2.17): last-run status, next-run, stalled. */}
        {(lastStatusMeta || nextRunRelative || schedule?.stalled) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {lastStatusMeta && (
              <Chip tone={lastStatusMeta.tone} icon={lastStatusMeta.Icon}>
                {lastStatusMeta.label}
              </Chip>
            )}
            {nextRunRelative && (
              <Chip tone="info" icon={Timer}>
                Next {nextRunRelative}
              </Chip>
            )}
            {schedule?.stalled && (
              <Chip tone="warn" icon={AlertTriangle}>
                Schedule may be stalled
              </Chip>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
