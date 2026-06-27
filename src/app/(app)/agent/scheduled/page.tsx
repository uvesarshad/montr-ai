'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, CheckCircle2, AlertCircle, Pause, Play, RefreshCw, Clock } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
  Button,
  Card,
  Chip,
  Segmented,
  Skeleton,
  EmptyState,
  PageHeader,
  ActionMenu,
  type ChipTone,
} from '@/components/ui-kit';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduledTask {
  _id: string;
  name: string;
  description: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  cronExpression: string;
  timezone: string;
  nextRunAt: string;
  lastRunAt?: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  lastResult?: { success: boolean; message: string };
  runCount: number;
  maxRuns?: number;
  missionId?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: LucideIcon; tone: ChipTone }> = {
  active:    { label: 'Active',    icon: Play,         tone: 'ok' },
  paused:    { label: 'Paused',    icon: Pause,        tone: 'warn' },
  completed: { label: 'Completed', icon: CheckCircle2, tone: 'info' },
  failed:    { label: 'Failed',    icon: AlertCircle,  tone: 'danger' },
};

const STATUS_FILTERS = ['all', 'active', 'paused', 'completed', 'failed'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduledTasksPage() {
  const router = useRouter();
  const { currentBrandId } = useCurrentBrand();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchTasks = useCallback(async (silent = false) => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (currentBrandId) params.set('brandId', currentBrandId);
      const res = await fetch(`/api/v2/agent/scheduled-tasks?${params}`);
      const data = await res.json();
      setTasks(data.scheduledTasks ?? []);
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, currentBrandId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleTogglePause = async (task: ScheduledTask) => {
    setUpdatingId(task._id);
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/v2/agent/scheduled-tasks/${task._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Task ${newStatus === 'active' ? 'resumed' : 'paused'}`);
        setTasks(prev => prev.map(t => t._id === task._id ? { ...t, status: newStatus } : t));
      } else {
        toast.error('Failed to update task');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        icon={Calendar}
        title="Scheduled Tasks"
        sub="Recurring and deferred actions the agent has scheduled."
        actions={
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => fetchTasks()}>
            Refresh
          </Button>
        }
      />

      {/* Status filter */}
      <Segmented
        options={STATUS_FILTERS.map(f => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No scheduled tasks"
          note="Tasks the agent schedules (via schedule_call, schedule_campaign, etc.) appear here."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <TaskCard
              key={task._id}
              task={task}
              updating={updatingId === task._id}
              onTogglePause={() => handleTogglePause(task)}
              onViewMission={() => task.missionId && router.push(`/agent/missions/${task.missionId}`)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: ScheduledTask;
  updating: boolean;
  onTogglePause: () => void;
  onViewMission: () => void;
}

function TaskCard({ task, updating, onTogglePause, onViewMission }: TaskCardProps) {
  const [showArgs, setShowArgs] = useState(false);
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;

  const nextRun = new Date(task.nextRunAt);
  const isPast = nextRun < new Date();

  return (
    <Card>
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{task.name}</span>
              <Chip tone={statusCfg.tone} icon={StatusIcon} className="h-[19px] text-[11px]">
                {statusCfg.label}
              </Chip>
            </div>
            {task.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Chip tone="gray" className="h-[19px] font-mono text-[11px]">{task.toolName}</Chip>
            {(task.status === 'active' || task.status === 'paused' || task.missionId) && (
              <ActionMenu
                items={[
                  ...(task.status === 'active' || task.status === 'paused'
                    ? [{
                        label: task.status === 'active' ? 'Pause' : 'Resume',
                        icon: task.status === 'active' ? Pause : Play,
                        onSelect: onTogglePause,
                        disabled: updating,
                      }]
                    : []),
                  ...(task.missionId
                    ? [{ label: 'View mission', icon: Clock, onSelect: onViewMission, separatorBefore: true }]
                    : []),
                ]}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Cron</span>
            <p className="font-mono">{task.cronExpression}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Timezone</span>
            <p className="truncate">{task.timezone}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Next run</span>
            <p className={cn(isPast && task.status === 'active' && 'text-danger')}>
              {isPast ? 'Overdue' : nextRun.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Runs</span>
            <p>{task.runCount}{task.maxRuns ? ` / ${task.maxRuns}` : ''}</p>
          </div>
        </div>

        {task.lastResult && (
          <div className={cn(
            'rounded px-2 py-1 text-xs',
            task.lastResult.success
              ? 'bg-success-muted text-success-foreground'
              : 'bg-danger-muted text-danger-foreground',
          )}>
            Last result: {task.lastResult.message}
          </div>
        )}

        <div>
          <button
            type="button"
            className="text-xs text-brand-strong underline underline-offset-2"
            onClick={() => setShowArgs(v => !v)}
          >
            {showArgs ? 'Hide' : 'Show'} arguments
          </button>
          {showArgs && (
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
              {JSON.stringify(task.toolArgs, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </Card>
  );
}
