'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  BookText,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  FolderKanban,
  ListChecks,
  Link2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Button,
  Chip,
  ChipTone,
  IconButton,
  Meter,
  Select,
  Spinner,
  Timeline,
  TimelineItem,
  Avatar,
} from '@/components/ui-kit';
import {
  AgentMissionApproval,
  AgentMissionContextSummary,
  AgentMissionScheduledTask,
} from '@/hooks/agent/use-agent-mission-context';
import { AgentMissionEvent, AgentMissionLink } from '@/hooks/agent/use-agent-mission';
import { AgentMissionListItem, AgentMissionPlanStep } from '@/hooks/agent/use-agent-missions';
import { AgentBrandOption } from './agent-launcher-state';
import { groupMissionLinks } from '@/lib/agent/mission-link-groups';
import { getMissionLinkPresentation } from '@/lib/agent/mission-link-presenter';
import styles from './agent-shell.module.css';

const SPECIALIST_BADGE_CLASS: Record<string, string> = {
  marketing: styles.specMarketing,
  social: styles.specSocial,
  crm: styles.specCrm,
  knowledge: styles.specKnowledge,
  automation: styles.specAutomation,
  general: styles.specGeneral,
};

function getSpecialistBadgeClass(agentId?: string) {
  if (!agentId) return styles.specGeneral;
  return SPECIALIST_BADGE_CLASS[agentId.toLowerCase()] ?? styles.specGeneral;
}

const MODE_OPTIONS = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'approval-first', label: 'Plan + approval' },
  { value: 'autonomous', label: 'Full autonomy' },
];

interface AgentContextRailProps {
  mission: AgentMissionListItem | null;
  summary: AgentMissionContextSummary | null;
  events: AgentMissionEvent[];
  approvals: AgentMissionApproval[];
  scheduledTasks: AgentMissionScheduledTask[];
  links: AgentMissionLink[];
  toolsUsed: number;
  activeBrand?: AgentBrandOption;
  formatTime: (value?: string | Date | null) => string;
  onChangeMode: (mode: AgentMissionListItem['mode']) => void;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  onToggleTask: (taskId: string, currentStatus: AgentMissionScheduledTask['status']) => void;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onClose?: () => void;
  modeLabel: (mode?: AgentMissionListItem['mode']) => string;
}

function getLinkIcon(targetType: string): LucideIcon {
  if (targetType === 'brand_memory') return BookText;
  if (targetType === 'roadmap_task') return FolderKanban;
  if (targetType.includes('post') || targetType.includes('social')) return Calendar;
  if (targetType.includes('doc') || targetType.includes('note')) return FileText;
  return Link2;
}

function getLinkIconTone(targetType: string) {
  if (targetType === 'brand_memory') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300';
  if (targetType === 'roadmap_task') return 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300';
  if (targetType.includes('post') || targetType.includes('social')) return 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300';
  return 'bg-brand-muted text-brand-strong';
}

/** Card shell matching the mockup `.cx` section — kit-styled header + body. */
function RailCard({
  icon: Icon,
  iconClass,
  title,
  count,
  badge,
  pulse,
  children,
}: {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  count?: number | string;
  badge?: React.ReactNode;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[10px] border border-white/55 dark:border-white/[0.07]',
        'app-glass',
        pulse && styles.alertCard,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-black/[0.07] px-3 py-2 dark:border-white/[0.06]">
        <div className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md', iconClass)}>
          <Icon className="size-2.5" />
        </div>
        <span className="text-[11.5px] font-semibold text-foreground">{title}</span>
        {count != null && <span className="text-[10.5px] font-semibold text-muted-foreground">{count}</span>}
        {badge ? <span className="ml-auto">{badge}</span> : null}
      </div>
      {children}
    </div>
  );
}

function MissionStatusCard({
  mission,
  toolsUsed,
  formatTime,
  onChangeMode,
  modeLabel,
}: {
  mission: AgentMissionListItem | null;
  toolsUsed: number;
  formatTime: (value?: string | Date | null) => string;
  onChangeMode: (mode: AgentMissionListItem['mode']) => void;
  modeLabel: (mode?: AgentMissionListItem['mode']) => string;
}) {
  const status = mission?.status || 'draft';
  const dotClass =
    status === 'active' || status === 'draft'
      ? cn('size-1.5 rounded-full', styles.dotLive, styles.blink)
      : status === 'waiting' || status === 'blocked'
        ? cn('size-1.5 rounded-full', styles.dotWait)
        : status === 'scheduled'
          ? cn('size-1.5 rounded-full', styles.dotSched)
          : cn('size-1.5 rounded-full', styles.dotDone);
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const specialist = (mission?.activeAgentId || 'general').toLowerCase();

  return (
    <RailCard
      icon={Activity}
      iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
      title="Mission"
    >
      <div className="flex flex-col gap-2 px-3 py-2.5 text-[11.5px]">
        <Row label="Status">
          <span className={dotClass} />
          <span className="font-medium text-foreground">{statusLabel}</span>
        </Row>
        <Row label="Mode">
          <Select
            value={mission?.mode || 'mixed'}
            onChange={(value) => onChangeMode(value as AgentMissionListItem['mode'])}
            disabled={!mission}
            placeholder={modeLabel(mission?.mode)}
            options={MODE_OPTIONS}
            triggerClassName="h-6 px-2 text-[11px] font-medium"
          />
        </Row>
        <Row label="Specialist">
          <span className={cn('rounded px-1.5 py-px text-[9.5px] font-bold lowercase', getSpecialistBadgeClass(specialist))}>
            @{specialist}
          </span>
        </Row>
        <Row label="Started">
          <span className="font-medium text-foreground">{formatTime(mission?.lastActivityAt)}</span>
        </Row>
        <Row label="Tools used">
          <span className="font-medium text-foreground">{toolsUsed}</span>
        </Row>
      </div>
    </RailCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[62px] shrink-0 text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 text-[11.5px]">{children}</span>
    </div>
  );
}

function formatClockTime(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Plan steps map onto the mockup `.task-row` checklist; status drives the check icon + strike. */
function GoalsCard({ plan, steps }: { plan?: AgentMissionListItem['plan']; steps: AgentMissionPlanStep[] }) {
  if (steps.length === 0) return null;
  const done = steps.filter((step) => step.status === 'done').length;
  const pct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;
  const goalLabel = plan?.goal?.trim();
  return (
    <RailCard
      icon={Target}
      iconClass="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"
      title="Goal"
      count={`${pct}%`}
    >
      <div className="px-3 py-2.5">
        {goalLabel ? (
          <div className="mb-2 text-[12px] font-medium leading-snug text-foreground">{goalLabel}</div>
        ) : null}
        <Meter value={pct} tone="brand" className="mb-1.5" />
        <div className="text-[10.5px] text-muted-foreground">
          {done} of {steps.length} step{steps.length === 1 ? '' : 's'} complete
        </div>
      </div>
    </RailCard>
  );
}

function TasksCard({ steps, formatTime }: { steps: AgentMissionPlanStep[]; formatTime: (value?: string | Date | null) => string }) {
  if (steps.length === 0) return null;
  const done = steps.filter((step) => step.status === 'done').length;
  return (
    <RailCard
      icon={ListChecks}
      iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
      title="Tasks"
      count={`${done}/${steps.length}`}
    >
      <div className="flex flex-col">
        {steps.map((step, idx) => {
          const isDone = step.status === 'done';
          const isActive = step.status === 'in_progress';
          const isBlocked = step.status === 'blocked';
          const isSkipped = step.status === 'skipped';
          return (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-[11.5px]',
                idx > 0 && 'border-t border-black/[0.07] dark:border-white/[0.06]'
              )}
            >
              <span
                className={cn(
                  'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] font-bold',
                  isDone && 'border-emerald-500 bg-emerald-500 text-white',
                  isActive && 'border-brand bg-brand-muted text-brand-strong',
                  isBlocked && 'border-rose-400 text-rose-500',
                  !isDone && !isActive && !isBlocked && 'border-black/20 text-transparent dark:border-white/15'
                )}
              >
                {isDone ? <Check className="size-2.5" /> : isActive ? <Spinner size={8} className="border-current" /> : isBlocked ? '!' : ''}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  (isDone || isSkipped) && 'text-muted-foreground line-through',
                  isActive && 'font-semibold text-foreground',
                  !isDone && !isActive && !isSkipped && 'text-foreground'
                )}
              >
                {step.title}
              </span>
              {isActive && (
                <Chip tone="brand" className="h-[16px] shrink-0 text-[9px] uppercase tracking-[0.03em]">now</Chip>
              )}
              {isDone && step.completedAt && (
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(step.completedAt)}</span>
              )}
            </div>
          );
        })}
      </div>
    </RailCard>
  );
}

const EXEC_TONE: Record<string, ChipTone> = {
  done: 'ok',
  running: 'brand',
  error: 'danger',
};

/** Mockup `.exec-*` execution timeline — built from persisted tool_call/tool_result/error events. */
function ExecutionCard({ items, live }: { items: TimelineItem[]; live: boolean }) {
  if (items.length === 0) return null;
  return (
    <RailCard
      icon={Activity}
      iconClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
      title="Execution"
      count={items.length}
      badge={
        live ? (
          <Chip tone="ok" className="h-[16px] text-[9px] uppercase tracking-[0.03em]">
            <span className={cn('size-1 rounded-full bg-current', styles.blink)} />
            live
          </Chip>
        ) : undefined
      }
    >
      <div className="px-3 py-2.5">
        <Timeline items={items} />
      </div>
    </RailCard>
  );
}

interface ExecEntry {
  toolName: string;
  status: 'done' | 'running' | 'error';
  at?: string;
  summary?: string;
}

/** Fold tool_call/tool_result/error events into per-tool execution entries (latest state wins). */
function collectExecution(events: AgentMissionEvent[]): ExecEntry[] {
  const entries: ExecEntry[] = [];
  for (const event of events) {
    const meta = event.metadata ?? {};
    if (event.type === 'tool_call' || event.type === 'tool_result') {
      const toolName = typeof meta.toolName === 'string' && meta.toolName.trim() ? meta.toolName : 'tool';
      const summary =
        typeof meta.resultSummary === 'string'
          ? meta.resultSummary
          : typeof meta.argsSummary === 'string'
            ? meta.argsSummary
            : typeof event.content === 'string'
              ? event.content
              : undefined;
      entries.push({
        toolName,
        status: event.type === 'tool_result' ? 'done' : 'running',
        at: event.createdAt,
        summary: summary?.slice(0, 60),
      });
    } else if (event.type === 'error') {
      entries.push({
        toolName: typeof meta.toolName === 'string' && meta.toolName.trim() ? meta.toolName : 'error',
        status: 'error',
        at: event.createdAt,
        summary: typeof event.content === 'string' ? event.content.slice(0, 60) : undefined,
      });
    }
  }
  return entries;
}

function ApprovalCard({
  approvals,
  onApprove,
  onReject,
}: {
  approvals: AgentMissionApproval[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (approvals.length === 0) return null;
  const top = approvals[0];
  const argsEntries = Object.entries(top.toolArgs || {}).slice(0, 4);
  return (
    <RailCard
      icon={ShieldCheck}
      iconClass="bg-brand-muted text-brand-strong"
      title="Approval needed"
      count={approvals.length}
      pulse
    >
      <div className="px-3 py-2.5">
        <div className="mb-1 font-mono text-[11px] text-muted-foreground">{top.toolName}</div>
        <div className="mb-2 text-[12.5px] font-semibold leading-snug text-foreground">{top.toolDescription || `Run ${top.toolName}?`}</div>
        {argsEntries.length > 0 && (
          <div className="mb-2.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
            {argsEntries.map(([key, value]) => (
              <div key={key} className="break-words font-mono leading-snug">
                <span className="font-semibold text-brand-strong">{key}:</span> {String(value).slice(0, 80)}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Button variant="brand" size="sm" icon={Check} onClick={() => onApprove(top._id)} className="flex-1 justify-center">
            Approve
          </Button>
          <Button variant="outline" size="sm" icon={X} onClick={() => onReject(top._id)} className="flex-1 justify-center">
            Reject
          </Button>
        </div>
        {approvals.length > 1 && (
          <div className="mt-2 text-[10.5px] text-muted-foreground">
            +{approvals.length - 1} more pending
          </div>
        )}
      </div>
    </RailCard>
  );
}

function ScheduledCard({
  tasks,
  formatTime,
  onToggleTask,
  onCancelTask,
  onRetryTask,
}: {
  tasks: AgentMissionScheduledTask[];
  formatTime: (value?: string | Date | null) => string;
  onToggleTask: (id: string, status: AgentMissionScheduledTask['status']) => void;
  onCancelTask: (id: string) => void;
  onRetryTask: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <RailCard
      icon={Clock}
      iconClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
      title="Scheduled"
      count={tasks.length}
    >
      <div className="flex flex-col">
        {tasks.slice(0, 5).map((task, idx) => {
          const chipTone =
            task.status === 'active' ? 'ok' : task.status === 'failed' ? 'danger' : 'info';
          return (
            <div
              key={task._id}
              className={cn(
                'flex items-center gap-2 px-3 py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
                idx > 0 && 'border-t border-black/[0.07] dark:border-white/[0.06]'
              )}
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                <CalendarClock className="size-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-medium leading-tight text-foreground">{task.name}</div>
                <div className="mt-px text-[10.5px] text-muted-foreground">
                  {task.nextRunAt ? `Next ${formatTime(task.nextRunAt)}` : task.description.slice(0, 40)}
                </div>
              </div>
              <Chip tone={chipTone} className="h-[17px] text-[9.5px] uppercase tracking-[0.03em]">
                {task.status}
              </Chip>
              {task.status === 'active' || task.status === 'paused' ? (
                <IconButton
                  icon={task.status === 'active' ? Pause : Play}
                  iconSize={10}
                  onClick={() => onToggleTask(task._id, task.status)}
                  aria-label={task.status === 'active' ? 'Pause' : 'Resume'}
                  className="size-5"
                />
              ) : task.status === 'failed' ? (
                <IconButton
                  icon={RefreshCw}
                  iconSize={10}
                  onClick={() => onRetryTask(task._id)}
                  aria-label="Retry"
                  className="size-5"
                />
              ) : null}
              <IconButton
                icon={Trash2}
                iconSize={10}
                onClick={() => onCancelTask(task._id)}
                aria-label="Cancel"
                className="size-5 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/15"
              />
            </div>
          );
        })}
      </div>
    </RailCard>
  );
}

function LinksCard({ links }: { links: AgentMissionLink[] }) {
  if (links.length === 0) return null;
  const groups = groupMissionLinks(links);
  return (
    <RailCard
      icon={Link2}
      iconClass="bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300"
      title="Linked artifacts"
      count={links.length}
    >
      <div className="flex flex-col">
        {groups.flatMap((group) => group.links.slice(0, 4)).slice(0, 8).map((link, idx) => {
          const presentation = getMissionLinkPresentation(link);
          const Icon = getLinkIcon(link.targetType);
          const tone = getLinkIconTone(link.targetType);
          const Container: React.ElementType = link.targetRoute ? Link : 'div';
          const containerProps = link.targetRoute ? { href: link.targetRoute } : {};
          return (
            <Container
              key={link._id}
              {...containerProps}
              className={cn(
                'flex items-center gap-2 px-3 py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
                idx > 0 && 'border-t border-black/[0.07] dark:border-white/[0.06]'
              )}
            >
              <div className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', tone)}>
                <Icon className="size-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-medium leading-tight text-foreground">{presentation.title}</div>
                <div className="truncate text-[10.5px] text-muted-foreground">{presentation.detail}</div>
              </div>
              {link.targetRoute && <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
            </Container>
          );
        })}
      </div>
    </RailCard>
  );
}

function BrandCard({ brand }: { brand?: AgentBrandOption }) {
  if (!brand) return null;
  return (
    <RailCard
      icon={Clock}
      iconClass="bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-300"
      title="Brand context"
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar name={brand.name} size={32} square className="shadow-[0_1px_3px_rgba(123,92,240,.35)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-foreground">{brand.name}</div>
          <div className="truncate text-[10.5px] text-muted-foreground">
            {brand.handle ? `@${brand.handle} · ` : ''}Brand Memory · synced
          </div>
        </div>
      </div>
    </RailCard>
  );
}

export function AgentContextRail({
  mission,
  summary,
  events,
  approvals,
  scheduledTasks,
  links,
  toolsUsed,
  activeBrand,
  formatTime,
  onChangeMode,
  onApprove,
  onReject,
  onToggleTask,
  onCancelTask,
  onRetryTask,
  onClose,
  modeLabel,
}: AgentContextRailProps) {
  const planSteps = mission?.plan?.steps ?? [];
  const isLive = mission?.status === 'active' || mission?.status === 'waiting';

  const execItems = useMemo<TimelineItem[]>(() => {
    return collectExecution(events).map((entry) => ({
      title: entry.toolName,
      meta: [entry.summary, formatClockTime(entry.at)].filter(Boolean).join(' · ') || undefined,
      icon: entry.status === 'error' ? X : entry.status === 'done' ? CheckCircle2 : Workflow,
      tone: EXEC_TONE[entry.status],
    }));
  }, [events]);

  return (
    <aside
      className={cn(
        'flex w-[296px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-white/55 dark:border-white/[0.07]',
        styles.contextRailFrame
      )}
    >
      {onClose && (
        <div className="flex items-center justify-between border-b border-black/[0.07] px-3 py-2 dark:border-white/[0.06]">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Context</span>
          <IconButton icon={X} iconSize={12} onClick={onClose} aria-label="Hide context" className="size-6" />
        </div>
      )}
      <div className={cn('flex flex-1 flex-col gap-2.5 overflow-y-auto p-3', styles.slimScroll)}>
        <MissionStatusCard
          mission={mission}
          toolsUsed={toolsUsed}
          formatTime={formatTime}
          onChangeMode={onChangeMode}
          modeLabel={modeLabel}
        />
        <GoalsCard plan={mission?.plan} steps={planSteps} />
        <TasksCard steps={planSteps} formatTime={formatTime} />
        <ExecutionCard items={execItems} live={isLive} />
        <ApprovalCard approvals={approvals} onApprove={onApprove} onReject={onReject} />
        <ScheduledCard
          tasks={scheduledTasks}
          formatTime={formatTime}
          onToggleTask={onToggleTask}
          onCancelTask={onCancelTask}
          onRetryTask={onRetryTask}
        />
        <LinksCard links={links} />
        <BrandCard brand={activeBrand} />
        {summary && summary.failedTaskCount > 0 && (
          <div className="rounded-md border border-danger/25 bg-danger-muted px-2.5 py-1.5 text-[11px] text-danger-foreground">
            {summary.failedTaskCount} failed task{summary.failedTaskCount === 1 ? '' : 's'} need attention.
          </div>
        )}
      </div>
    </aside>
  );
}
