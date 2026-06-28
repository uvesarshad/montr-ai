'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CoreMessage } from 'ai';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Flag,
  Layers,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Rocket,
  Search,
  Send,
  Share2,
  Sparkles,
  Target,
  Wand2,
  Workflow,
  XCircle,
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import {
  Button,
  IconButton,
  Chip,
  Input,
  Spinner,
  Meter,
  Select,
  ChatBubble,
  MessageComposer,
} from '@/components/ui-kit';
import type {
  StrategyArtifact,
  StrategyDraftArtifact,
  StrategyActivationArtifact,
} from '@/lib/strategy/artifacts';
import type { AgentMissionApproval } from '@/hooks/agent/use-agent-mission-context';
import {
  AgentBrandOption,
  AgentStarterPrompt,
} from './agent-launcher-state';
import { AgentMissionEvent } from '@/hooks/agent/use-agent-mission';
import { AgentMissionListItem } from '@/hooks/agent/use-agent-missions';
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

function formatClockTime(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDayLabel(value?: string | Date | null) {
  if (!value) return 'Today';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today';
  const today = new Date();
  const isSameDay = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isSameDay) return `Today · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  if (isYesterday) return `Yesterday · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface PlanStep {
  index: number;
  total: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  updatedAt?: string;
}

function collectPlanSteps(events: AgentMissionEvent[]): PlanStep[] {
  const map = new Map<number, PlanStep>();
  for (const event of events) {
    if (event.type !== 'plan_step') continue;
    const metadata = event.metadata ?? {};
    const stepIndex = typeof metadata.stepIndex === 'number' ? metadata.stepIndex : null;
    const stepTotal = typeof metadata.stepTotal === 'number' ? metadata.stepTotal : 0;
    const description =
      typeof metadata.description === 'string'
        ? metadata.description
        : typeof event.content === 'string'
          ? event.content
          : '';
    const rawStatus = typeof metadata.status === 'string' ? metadata.status : 'pending';
    const status: PlanStep['status'] =
      rawStatus === 'completed' || rawStatus === 'done'
        ? 'completed'
        : rawStatus === 'in_progress' || rawStatus === 'active'
          ? 'in_progress'
          : 'pending';
    if (stepIndex == null) continue;

    map.set(stepIndex, {
      index: stepIndex,
      total: stepTotal,
      description,
      status,
      updatedAt: event.updatedAt,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.index - b.index);
}

function getMessageSpecialist(event: AgentMissionEvent, fallbackAgentId?: string): string {
  const meta = event.metadata ?? {};
  if (typeof meta.agentId === 'string' && meta.agentId.trim()) return meta.agentId.toLowerCase();
  if (typeof meta.specialist === 'string' && meta.specialist.trim()) return meta.specialist.toLowerCase();
  return (fallbackAgentId || 'general').toLowerCase();
}

interface AgentConversationProps {
  mission: AgentMissionListItem | null;
  events: AgentMissionEvent[];
  liveMessages: CoreMessage[];
  isLoading: boolean;
  isMissionLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onChangeMode: (mode: AgentMissionListItem['mode']) => void;
  formatTime: (value?: string | Date | null) => string;
  getModeLabel: (mode?: AgentMissionListItem['mode']) => string;
  starterPrompts: AgentStarterPrompt[];
  onStarterPrompt: (prompt: string) => void;
  activeBrand?: AgentBrandOption;
  userTurns: number;
  userInitials: string;
  /** Sends a chat message through the existing composer/agent loop — used by the
   *  strategy cards' Refine / Activate CTAs to iterate or activate a strategy. */
  onSendMessage?: (text: string) => void;
  /** Approve a HITL-gated PendingAgentAction (strategy activation roadmap sign-off). */
  onApproveAction?: (pendingActionId: string) => void | Promise<void>;
  /** Reject a HITL-gated PendingAgentAction. */
  onRejectAction?: (pendingActionId: string) => void | Promise<void>;
  /** Resolved status of pending actions (by id) so an activation card can show
   *  the final state instead of stale Approve/Reject buttons after a refresh. */
  approvalStatusById?: Record<string, AgentMissionApproval['status']>;
}

// Keep in sync with AGENT_DEFINITIONS (src/lib/agent/multi-agent/agent-definitions.ts)
// and detectExplicitAgentRequest mention patterns. automation-agent was folded
// into ops-agent (2026-06-05); strategy/voice/inbox/ops/recruitment/content
// specialists added.
const SPECIALIST_OPTIONS = [
  { id: 'strategy', label: '@strategy', hint: 'goals, strategy, roadmaps' },
  { id: 'marketing', label: '@marketing', hint: 'campaigns, email, content' },
  { id: 'social', label: '@social', hint: 'posts, scheduling' },
  { id: 'crm', label: '@crm', hint: 'contacts, deals, pipeline' },
  { id: 'inbox', label: '@inbox', hint: 'conversations, replies' },
  { id: 'voice', label: '@voice', hint: 'calls, transcripts' },
  { id: 'knowledge', label: '@knowledge', hint: 'docs, memory, FAQs' },
  { id: 'content-factory', label: '@content-factory', hint: 'bulk content, media' },
  { id: 'recruit', label: '@recruit', hint: 'hiring, candidates' },
  { id: 'ops', label: '@ops', hint: 'workflows, approvals, schedules' },
  { id: 'general', label: '@general', hint: 'open-ended' },
];

const MODE_OPTIONS = [
  { value: 'mixed', label: 'Mixed mode' },
  { value: 'approval-first', label: 'Plan + approval' },
  { value: 'autonomous', label: 'Full autonomy' },
];

export function AgentConversation({
  mission,
  events,
  liveMessages,
  isLoading,
  isMissionLoading,
  input,
  onInputChange,
  onSubmit,
  onChangeMode,
  formatTime,
  getModeLabel,
  starterPrompts,
  onStarterPrompt,
  activeBrand,
  userTurns,
  userInitials,
  onSendMessage,
  onApproveAction,
  onRejectAction,
  approvalStatusById,
}: AgentConversationProps) {
  const planSteps = useMemo(() => collectPlanSteps(events), [events]);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  const [specialistOpen, setSpecialistOpen] = useState(false);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const planTotal = planSteps.length > 0 ? planSteps[0].total || planSteps.length : 0;
  const planDone = planSteps.filter((step) => step.status === 'completed').length;
  const planPct = planTotal > 0 ? Math.round((planDone / planTotal) * 100) : 0;

  const activeSpecialistFromInput = useMemo(() => {
    const trimmed = input.trimStart();
    const match = trimmed.match(/^@(\w+)/);
    return match ? match[1].toLowerCase() : (mission?.activeAgentId || 'general').toLowerCase();
  }, [input, mission?.activeAgentId]);

  useEffect(() => {
    if (scrollBottomRef.current) {
      scrollBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length, liveMessages.length, isLoading]);

  const dayLabel = events.length > 0 ? formatDayLabel(events[0].createdAt) : 'Today';
  const isLive = mission?.status === 'active' || mission?.status === 'waiting';

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-white/55 bg-[var(--app-bg,transparent)] dark:border-white/[0.07]">
      {/* Chat header */}
      <header className="flex h-[50px] shrink-0 items-center gap-2.5 border-b border-black/[0.07] bg-white/82 px-4 backdrop-blur-md dark:border-white/[0.06] dark:bg-[#0A0A14]/86">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-brand-muted text-brand-strong">
          {mission ? <Sparkles className="size-3.5" /> : <Target className="size-3.5" />}
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="truncate text-[13.5px] font-semibold leading-tight text-foreground">
            {mission?.title || 'Mission workspace'}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {isLive && (
              <Chip tone="ok" className="h-[15px] px-1.5 text-[9.5px] uppercase tracking-[0.04em]">
                <span className={cn('size-1 rounded-full bg-current', styles.blink)} />
                Live
              </Chip>
            )}
            {mission?.activeAgentId && (
              <span className="truncate">@{mission.activeAgentId.toLowerCase()}</span>
            )}
            {mission?.lastActivityAt && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="truncate">Started {formatTime(mission.lastActivityAt)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex-1" />
        <Select
          value={mission?.mode || 'mixed'}
          onChange={(value) => onChangeMode(value as AgentMissionListItem['mode'])}
          disabled={!mission}
          placeholder={getModeLabel(mission?.mode)}
          options={MODE_OPTIONS}
          triggerClassName="h-[30px] w-auto gap-1.5 text-[12px] font-medium"
        />
        <IconButton icon={Share2} iconSize={14} aria-label="Share mission"
          className="h-[30px] w-[30px] rounded-md border border-input bg-card" />
        <IconButton icon={MoreVertical} iconSize={14} aria-label="More"
          className="h-[30px] w-[30px] rounded-md border border-input bg-card" />
      </header>

      {/* Pinned plan card */}
      {planSteps.length > 0 && (
        <div className={cn('mx-[18px] mt-[14px] shrink-0 overflow-hidden rounded-[10px] border border-white/55 dark:border-white/[0.07]', 'app-glass', styles.planCard)}>
          <div className={cn('flex items-center gap-2 border-b border-black/[0.07] px-3 py-[9px] dark:border-white/[0.06]', styles.planHeaderBg)}>
            <CheckCircle2 className="size-3 text-brand-strong" />
            <span className="text-[12px] font-semibold text-foreground">Mission plan</span>
            <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <Meter value={planPct} tone="brand" className="w-[60px]" />
              <span className="min-w-[36px] text-right text-[11px] font-semibold text-foreground">
                {planDone} / {planTotal}
              </span>
            </div>
            <IconButton
              icon={ChevronDown}
              iconSize={12}
              onClick={() => setPlanCollapsed((prev) => !prev)}
              aria-label={planCollapsed ? 'Expand plan' : 'Collapse plan'}
              className={cn('ml-1 h-[18px] w-[18px]', planCollapsed && '[&_svg]:-rotate-90')}
            />
          </div>
          {!planCollapsed && (
            <div className="py-1.5">
              {planSteps.map((step) => {
                const done = step.status === 'completed';
                const active = step.status === 'in_progress';
                return (
                  <div key={step.index} className="flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] transition hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
                    <span
                      className={cn(
                        'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] font-bold',
                        done && 'border-emerald-500 bg-emerald-500 text-white',
                        active && 'border-brand bg-brand-muted text-brand-strong',
                        !done && !active && 'border-black/20 text-transparent dark:border-white/15'
                      )}
                    >
                      {done ? <Check className="size-2.5" /> : active ? '→' : ''}
                    </span>
                    <span
                      className={cn(
                        'flex-1',
                        done && 'text-muted-foreground line-through',
                        active && 'font-semibold text-foreground',
                        !done && !active && 'text-foreground'
                      )}
                    >
                      {step.description || `Step ${step.index + 1}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {done ? formatTime(step.updatedAt) : active ? 'In progress' : 'Up next'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Message stream */}
      <div className={cn('flex-1 overflow-y-auto px-[18px] py-[14px]', styles.slimScroll)}>
        <div className="flex flex-col gap-3.5">
          {events.length > 0 && (
            <div className="my-1.5 flex items-center gap-2.5">
              <div className="h-px flex-1 bg-black/[0.07] dark:bg-white/[0.06]" />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {dayLabel}
              </span>
              <div className="h-px flex-1 bg-black/[0.07] dark:bg-white/[0.06]" />
            </div>
          )}

          {!mission && userTurns === 0 && (
            <div className="grid gap-2.5 md:grid-cols-2">
              {starterPrompts.map((sp) => {
                const Icon =
                  sp.icon === 'workflow'
                    ? Workflow
                    : sp.icon === 'content'
                      ? Wand2
                      : sp.icon === 'insights'
                        ? BarChart3
                        : Target;
                return (
                  <button
                    key={sp.title}
                    type="button"
                    onClick={() => onStarterPrompt(sp.prompt)}
                    className="group rounded-[10px] border border-white/55 bg-white/72 p-3 text-left backdrop-blur-md transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white dark:border-white/[0.07] dark:bg-[#10101A]/78 dark:hover:bg-[#10101A]"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Starter
                    </div>
                    <div className="mt-2 flex size-8 items-center justify-center rounded-md bg-brand-muted text-brand-strong">
                      <Icon className="size-3.5" />
                    </div>
                    <div className="mt-2.5 text-[13px] font-semibold text-foreground">{sp.title}</div>
                    <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{sp.prompt}</div>
                    <div className="mt-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand-strong opacity-0 transition group-hover:opacity-100">
                      Start
                      <ArrowRight className="size-3" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {events.map((event) => (
            <EventRow
              key={event._id}
              event={event}
              missionAgentId={mission?.activeAgentId}
              userInitials={userInitials}
              onSendMessage={onSendMessage}
              onApproveAction={onApproveAction}
              onRejectAction={onRejectAction}
              approvalStatusById={approvalStatusById}
            />
          ))}

          {liveMessages.map((message, index) => (
            <LiveMessageRow
              key={`live-${index}`}
              message={message}
              missionAgentId={mission?.activeAgentId}
              userInitials={userInitials}
            />
          ))}

          {(isLoading || isMissionLoading) && (
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Spinner size={12} />
              {isLoading ? 'Agent is working' : 'Hydrating mission'}
            </div>
          )}

          <div ref={scrollBottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-[18px] pb-3.5 pt-2.5">
        {activeBrand && (
          <div className="mb-1.5 flex items-center gap-1 px-1 text-[10.5px] text-muted-foreground">
            Grounded in <span className="font-medium text-foreground">{activeBrand.name}</span> Brand Memory
          </div>
        )}
        <MessageComposer
          value={input}
          onChange={onInputChange}
          onSubmit={() => onSubmit()}
          placeholder="Reply to the mission... use @ to switch specialist"
          disabled={isLoading}
          submitting={isLoading}
          actions={
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSpecialistOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
                >
                  <span className="size-1.5 rounded-full bg-brand" />
                  @{activeSpecialistFromInput}
                  <ChevronDown className="size-2.5" />
                </button>
                {specialistOpen && (
                  <div className="absolute bottom-[calc(100%+4px)] left-0 z-30 w-[180px] overflow-hidden rounded-md border border-input bg-card py-1 shadow-lg">
                    {SPECIALIST_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const trimmed = input.trimStart().replace(/^@\w+\s*/, '');
                          onInputChange(`${opt.label} ${trimmed}`);
                          setSpecialistOpen(false);
                        }}
                        className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition hover:bg-muted"
                      >
                        <span className="text-[11.5px] font-semibold text-foreground">{opt.label}</span>
                        <span className="text-[10.5px] text-muted-foreground">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <IconButton icon={Paperclip} iconSize={14} aria-label="Attach" className="size-7" />
              <IconButton icon={Search} iconSize={14} aria-label="Reference" className="size-7" />
            </div>
          }
        />
      </div>
    </section>
  );
}

interface MessageRowProps {
  isUser: boolean;
  initials: string;
  name: string;
  specialist?: string;
  specialistClass?: string;
  time?: string;
  content: string;
}

function MessageBubble({ initials, isUser, name, specialist, specialistClass, time, content }: MessageRowProps) {
  return (
    <div className="group flex gap-2.5">
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[10.5px] font-bold text-white',
          isUser
            ? 'bg-gradient-to-br from-emerald-500 to-emerald-700'
            : 'bg-gradient-to-br from-[#9B7BF8] to-[#6B3EEC] shadow-[0_1px_3px_rgba(123,92,240,.35)]'
        )}
      >
        {isUser ? initials : <Sparkles className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-semibold text-foreground">{name}</span>
          {!isUser && specialist && (
            <span className={cn('rounded px-1.5 py-px text-[9.5px] font-bold lowercase', specialistClass)}>
              @{specialist}
            </span>
          )}
          {time && <span className="text-[10.5px] text-muted-foreground">{time}</span>}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <IconButton icon={Copy} iconSize={10} aria-label="Copy" className="h-[22px] w-[22px]" />
          </div>
        </div>
        <ChatBubble dir={isUser ? 'out' : 'in'} className="max-w-full">
          {isUser ? (
            <span className="whitespace-pre-wrap break-words">{content}</span>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-[14px] [&_h3]:text-[13px] [&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_code]:text-[12px]">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </ChatBubble>
      </div>
    </div>
  );
}

function ToolCallCard({ event }: { event: AgentMissionEvent }) {
  const meta = event.metadata ?? {};
  const toolName = typeof meta.toolName === 'string' ? meta.toolName : 'tool';
  const argsText =
    typeof meta.argsSummary === 'string'
      ? meta.argsSummary
      : typeof event.content === 'string'
        ? event.content
        : '';
  return (
    <div className="ml-[38px] overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-black/[0.025] px-3 py-1.5 dark:bg-white/[0.025]">
        <div className="flex h-[18px] w-[18px] items-center justify-center rounded bg-brand-muted text-brand-strong">
          <Workflow className="size-2.5" />
        </div>
        <span className="font-mono text-[11.5px] font-semibold text-foreground">{toolName}</span>
        <Chip tone="warn" className="ml-auto h-[18px] text-[10px]">
          <Spinner size={9} className="border-current" />
          Running
        </Chip>
      </div>
      {argsText && (
        <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{argsText}</div>
      )}
    </div>
  );
}

function ToolResultCard({ event }: { event: AgentMissionEvent }) {
  const meta = event.metadata ?? {};
  const toolName = typeof meta.toolName === 'string' ? meta.toolName : 'tool';
  const summary =
    typeof meta.resultSummary === 'string'
      ? meta.resultSummary
      : typeof event.content === 'string'
        ? event.content
        : '';
  return (
    <div className="ml-[38px] overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-black/[0.025] px-3 py-1.5 dark:bg-white/[0.025]">
        <div className="flex h-[18px] w-[18px] items-center justify-center rounded bg-brand-muted text-brand-strong">
          <Workflow className="size-2.5" />
        </div>
        <span className="font-mono text-[11.5px] font-semibold text-foreground">{toolName}</span>
        <Chip tone="ok" icon={Check} className="ml-auto h-[18px] text-[10px]">Done</Chip>
      </div>
      {summary && (
        <div className="px-3 py-2 text-[11.5px] text-muted-foreground">{summary.slice(0, 240)}</div>
      )}
    </div>
  );
}

function ArtifactCard({ event }: { event: AgentMissionEvent }) {
  const meta = event.metadata ?? {};
  const targetType = typeof meta.targetType === 'string' ? meta.targetType : 'artifact';
  const label = typeof meta.targetLabel === 'string' ? meta.targetLabel : event.content || 'New artifact';
  const route = typeof meta.targetRoute === 'string' ? meta.targetRoute : null;
  const Icon = targetType.includes('doc') ? FileText : targetType.includes('post') ? Calendar : MessageSquare;
  return (
    <div className="ml-[38px] flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 transition hover:border-input hover:shadow-sm">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand-strong">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold text-foreground">{label}</div>
        <div className="truncate text-[11px] text-muted-foreground">Linked · {targetType}</div>
      </div>
      <Chip tone="ok" className="h-[18px] text-[10px] uppercase tracking-[0.03em]">Saved</Chip>
      {route && (
        <a href={route} className="text-muted-foreground transition hover:text-brand-strong">
          <ChevronRight className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function StatusLine({ icon: Icon, text, tone }: { icon: typeof AlertCircle; text: string; tone: 'amber' | 'sky' | 'rose' | 'gray' }) {
  const chipTone = tone === 'amber' ? 'warn' : tone === 'sky' ? 'info' : tone === 'rose' ? 'danger' : 'gray';
  return (
    <div className="flex items-center gap-2 py-1 text-[11.5px] text-muted-foreground">
      <div className="h-px flex-1 bg-black/[0.07] dark:bg-white/[0.06]" />
      <Chip tone={chipTone} icon={Icon} className="h-[19px] text-[10.5px]">{text}</Chip>
      <div className="h-px flex-1 bg-black/[0.07] dark:bg-white/[0.06]" />
    </div>
  );
}

// ── Strategy WOW cards ────────────────────────────────────────────────────
// The strategy tools attach a typed `artifact` to their JSON result; the tool
// registry persists that result (JSON-stringified) on the tool_result event's
// metadata.resultFull. We parse it back out to render a live strategy card.

function parseStrategyArtifact(event: AgentMissionEvent): StrategyArtifact | null {
  const meta = event.metadata ?? {};
  const raw =
    typeof meta.resultFull === 'string'
      ? meta.resultFull
      : typeof meta.resultSummary === 'string'
        ? meta.resultSummary
        : typeof event.content === 'string'
          ? event.content
          : '';
  // Cheap pre-checks before paying for JSON.parse on every tool result.
  if (!raw || !raw.includes('"artifact"') || !raw.includes('strategy_')) return null;
  try {
    const parsed = JSON.parse(raw) as { artifact?: unknown };
    const artifact = parsed?.artifact as StrategyArtifact | undefined;
    if (artifact && (artifact.kind === 'strategy_draft' || artifact.kind === 'strategy_activation')) {
      return artifact;
    }
  } catch {
    // resultFull is capped at 50KB — strategy artifacts are tiny so they always
    // fit; a parse failure just means this result isn't a strategy card.
  }
  return null;
}

function formatStrategyDeadline(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function summarizeWeights(record?: Record<string, number>, suffix = ''): string {
  if (!record) return '';
  return Object.entries(record)
    .map(([key, value]) => `${key} ${value}${suffix}`)
    .join('  ·  ');
}

const VALIDATION_CHIP: Record<
  StrategyDraftArtifact['validationStatus'],
  { tone: 'ok' | 'warn' | 'danger'; label: string; icon: typeof CheckCircle2; ring: string; text: string }
> = {
  passed: { tone: 'ok', label: 'Validated', icon: CheckCircle2, ring: 'stroke-emerald-500', text: 'text-emerald-600' },
  passed_with_warnings: { tone: 'warn', label: 'Passed with warnings', icon: AlertCircle, ring: 'stroke-amber-500', text: 'text-amber-600' },
  failed: { tone: 'danger', label: 'Needs work', icon: XCircle, ring: 'stroke-rose-500', text: 'text-rose-600' },
};

function QualityRing({ score, status }: { score: number; status: StrategyDraftArtifact['validationStatus'] }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const palette = VALIDATION_CHIP[status] ?? VALIDATION_CHIP.passed_with_warnings;
  return (
    <div className="relative flex size-[60px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 56 56" className="size-[60px] -rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="5" className="stroke-black/[0.08] dark:stroke-white/10" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className={cn('transition-[stroke-dasharray] duration-700 ease-out', palette.ring)}
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-[16px] font-bold leading-none', palette.text)}>{clamped}</span>
        <span className="mt-px text-[7px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Quality</span>
      </div>
    </div>
  );
}

function StrategyDraftCard({
  artifact,
  onSendMessage,
}: {
  artifact: StrategyDraftArtifact;
  onSendMessage?: (text: string) => void;
}) {
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState('');
  const validation = VALIDATION_CHIP[artifact.validationStatus] ?? VALIDATION_CHIP.passed_with_warnings;
  const cadenceSummary = summarizeWeights(artifact.cadence);
  const contentMixSummary = summarizeWeights(artifact.contentMix);

  const sendRefine = () => {
    const constraints = refineText.trim();
    const instruction = constraints
      ? `Refine the "${artifact.name}" strategy (v${artifact.version}) with these changes: ${constraints}`
      : `Refine the "${artifact.name}" strategy (v${artifact.version}) — tighten the plan and lift its quality score.`;
    onSendMessage?.(instruction);
    setRefineText('');
    setRefineOpen(false);
  };

  const activate = () => {
    onSendMessage?.(`Activate the "${artifact.name}" strategy (v${artifact.version}) and turn it into a roadmap of missions.`);
  };

  return (
    <div className="ml-[38px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-black/[0.025] px-3.5 py-2 dark:bg-white/[0.025]">
        <div className="flex size-[22px] items-center justify-center rounded-md bg-brand-muted text-brand-strong">
          <Target className="size-3" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">Strategy draft</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">v{artifact.version}</span>
        {typeof artifact.parentVersion === 'number' && (
          <span className="inline-flex items-center gap-1 rounded bg-brand-muted px-1.5 py-px text-[10px] font-semibold text-brand-strong">
            <Wand2 className="size-2.5" />
            v{artifact.parentVersion} → v{artifact.version}
          </span>
        )}
        <Chip tone={validation.tone} icon={validation.icon} className="ml-auto h-[19px] text-[10px]">
          {validation.label}
        </Chip>
      </div>

      {/* Body */}
      <div className="space-y-3 px-3.5 py-3">
        {/* Identity + quality */}
        <div className="flex items-start gap-3.5">
          <QualityRing score={artifact.qualityScore} status={artifact.validationStatus} />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold leading-snug text-foreground">{artifact.name}</div>
            {artifact.description && (
              <p className="mt-0.5 line-clamp-3 text-[11.5px] leading-snug text-muted-foreground">{artifact.description}</p>
            )}
          </div>
        </div>

        {/* Goals */}
        {artifact.goals.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Goals</div>
            {artifact.goals.map((goal, index) => (
              <div key={`${goal.kpi}-${index}`} className="flex items-start gap-2 text-[12px]">
                <Flag className="mt-[3px] size-3 shrink-0 text-brand-strong" />
                <span className="text-foreground">
                  <span className="font-semibold">{goal.kpi}</span>
                  {goal.target && <span className="text-muted-foreground"> — {goal.target}</span>}
                  {goal.deadline && (
                    <span className="text-muted-foreground"> by {formatStrategyDeadline(goal.deadline)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Channels */}
        {artifact.channels.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Channels</div>
            <div className="flex flex-wrap gap-1.5">
              {artifact.channels.map((channel) => (
                <Chip key={channel} tone="gray" className="h-[20px] text-[10.5px]">
                  {channel}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Cadence / content mix */}
        {(cadenceSummary || contentMixSummary) && (
          <div className="grid gap-1.5 rounded-lg bg-muted/50 px-2.5 py-2 text-[11px]">
            {cadenceSummary && (
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-muted-foreground">Cadence</span>
                <span className="text-foreground">{cadenceSummary}</span>
              </div>
            )}
            {contentMixSummary && (
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-muted-foreground">Content mix</span>
                <span className="text-foreground">{contentMixSummary}</span>
              </div>
            )}
          </div>
        )}

        {/* Warnings (subtle) */}
        {artifact.warnings.length > 0 && (
          <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
            {artifact.warnings.slice(0, 4).map((warning, index) => (
              <div key={index} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-[2px] size-2.5 shrink-0" />
                <span className="leading-snug">{warning}</span>
              </div>
            ))}
            {artifact.warnings.length > 4 && (
              <div className="pl-4 text-[10.5px] text-amber-700/80 dark:text-amber-400/80">
                +{artifact.warnings.length - 4} more
              </div>
            )}
          </div>
        )}

        {/* Refine inline composer */}
        {refineOpen && (
          <div className="flex items-center gap-1.5">
            <Input
              value={refineText}
              onChange={(event) => setRefineText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  sendRefine();
                }
              }}
              placeholder="What should change? (e.g. add LinkedIn, weekly cadence)"
              className="h-8 text-[12px]"
              autoFocus
            />
            <IconButton
              icon={Send}
              iconSize={14}
              aria-label="Send refinement"
              onClick={sendRefine}
              className="size-8 shrink-0 rounded-md border border-input bg-card"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            icon={Wand2}
            onClick={() => setRefineOpen((prev) => !prev)}
            disabled={!onSendMessage}
          >
            Refine
          </Button>
          <Button
            variant="brand"
            size="sm"
            icon={Rocket}
            onClick={activate}
            disabled={!onSendMessage || !artifact.canActivate}
            title={artifact.canActivate ? undefined : 'Resolve validation issues before activating'}
          >
            Activate
          </Button>
          {!artifact.canActivate && (
            <span className="text-[10.5px] text-muted-foreground">Fix issues to activate</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StrategyActivationCard({
  artifact,
  onApproveAction,
  onRejectAction,
  resolvedStatus,
}: {
  artifact: StrategyActivationArtifact;
  onApproveAction?: (pendingActionId: string) => void | Promise<void>;
  onRejectAction?: (pendingActionId: string) => void | Promise<void>;
  resolvedStatus?: AgentMissionApproval['status'];
}) {
  const [localState, setLocalState] = useState<'idle' | 'approving' | 'rejecting' | 'approved' | 'rejected'>('idle');
  const { roadmap } = artifact;

  // Server truth (from mission context) wins over local optimistic state once it
  // catches up, so the card never shows stale Approve/Reject after a refresh.
  const effectiveStatus: 'pending' | 'approved' | 'rejected' | 'expired' | 'busy' =
    localState === 'approving' || localState === 'rejecting'
      ? 'busy'
      : resolvedStatus === 'approved' || localState === 'approved'
        ? 'approved'
        : resolvedStatus === 'rejected' || localState === 'rejected'
          ? 'rejected'
          : resolvedStatus === 'expired'
            ? 'expired'
            : 'pending';

  const approve = async () => {
    if (!onApproveAction) return;
    setLocalState('approving');
    try {
      await onApproveAction(artifact.pendingActionId);
      setLocalState('approved');
    } catch {
      setLocalState('idle');
    }
  };

  const reject = async () => {
    if (!onRejectAction) return;
    setLocalState('rejecting');
    try {
      await onRejectAction(artifact.pendingActionId);
      setLocalState('rejected');
    } catch {
      setLocalState('idle');
    }
  };

  const headerTone =
    effectiveStatus === 'approved' ? 'ok' : effectiveStatus === 'rejected' || effectiveStatus === 'expired' ? 'danger' : 'warn';

  return (
    <div className="ml-[38px] overflow-hidden rounded-xl border border-amber-500/30 bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-amber-500/[0.06] px-3.5 py-2">
        <div className="flex size-[22px] items-center justify-center rounded-md bg-brand-muted text-brand-strong">
          <Rocket className="size-3" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">Activate roadmap</span>
        <Chip
          tone={headerTone}
          icon={effectiveStatus === 'approved' ? CheckCircle2 : effectiveStatus === 'rejected' ? XCircle : AlertCircle}
          className="ml-auto h-[19px] text-[10px]"
        >
          {effectiveStatus === 'approved'
            ? 'Approved'
            : effectiveStatus === 'rejected'
              ? 'Rejected'
              : effectiveStatus === 'expired'
                ? 'Expired'
                : 'Approval needed'}
        </Chip>
      </div>

      {/* Body */}
      <div className="space-y-3 px-3.5 py-3">
        {/* Roadmap stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Entries', value: roadmap.totalEntries, icon: Layers, tone: 'text-foreground' },
            { label: 'Start now', value: roadmap.willSpawn, icon: Rocket, tone: 'text-emerald-600' },
            { label: 'Deferred', value: roadmap.deferred, icon: CalendarClock, tone: 'text-muted-foreground' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-muted/50 px-2.5 py-2">
              <div className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <stat.icon className="size-2.5" />
                {stat.label}
              </div>
              <div className={cn('mt-0.5 text-[18px] font-bold leading-none', stat.tone)}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* First missions preview */}
        {roadmap.firstMissionTitles.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              First missions
            </div>
            {roadmap.firstMissionTitles.map((title, index) => (
              <div key={`${title}-${index}`} className="flex items-start gap-2 text-[12px]">
                <span className="mt-[1px] flex size-[15px] shrink-0 items-center justify-center rounded-full bg-brand-muted text-[9px] font-bold text-brand-strong">
                  {index + 1}
                </span>
                <span className="text-foreground">{title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Outcome / actions */}
        {effectiveStatus === 'approved' ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-2 text-[11.5px] font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Roadmap activated — missions are starting.
          </div>
        ) : effectiveStatus === 'rejected' ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.07] px-2.5 py-2 text-[11.5px] font-medium text-rose-700 dark:text-rose-400">
            <XCircle className="size-3.5" />
            Activation rejected — the roadmap was not started.
          </div>
        ) : effectiveStatus === 'expired' ? (
          <div className="text-[11.5px] text-muted-foreground">This approval has expired.</div>
        ) : (
          <div className="flex items-center gap-2 pt-0.5">
            <Button
              variant="brand"
              size="sm"
              icon={effectiveStatus === 'busy' && localState === 'approving' ? undefined : Check}
              onClick={() => void approve()}
              disabled={!onApproveAction || effectiveStatus === 'busy'}
            >
              {localState === 'approving' ? <Spinner size={13} /> : 'Approve'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={effectiveStatus === 'busy' && localState === 'rejecting' ? undefined : XCircle}
              onClick={() => void reject()}
              disabled={!onRejectAction || effectiveStatus === 'busy'}
            >
              {localState === 'rejecting' ? <Spinner size={13} /> : 'Reject'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({
  event,
  missionAgentId,
  userInitials,
  onSendMessage,
  onApproveAction,
  onRejectAction,
  approvalStatusById,
}: {
  event: AgentMissionEvent;
  missionAgentId?: string;
  userInitials: string;
  onSendMessage?: (text: string) => void;
  onApproveAction?: (pendingActionId: string) => void | Promise<void>;
  onRejectAction?: (pendingActionId: string) => void | Promise<void>;
  approvalStatusById?: Record<string, AgentMissionApproval['status']>;
}) {
  if (event.type === 'message') {
    const isUser = event.role === 'user';
    const content = typeof event.content === 'string' ? event.content : '';
    if (!content.trim()) return null;
    const specialist = getMessageSpecialist(event, missionAgentId);
    return (
      <MessageBubble
        isUser={isUser}
        initials={userInitials}
        name={isUser ? 'You' : 'Agent'}
        specialist={isUser ? undefined : specialist}
        specialistClass={isUser ? undefined : getSpecialistBadgeClass(specialist)}
        time={formatClockTime(event.createdAt)}
        content={content}
      />
    );
  }

  if (event.type === 'tool_call') return <ToolCallCard event={event} />;
  if (event.type === 'tool_result') {
    // WOW bridge: a strategy tool result rides a structured `artifact` on its
    // JSON payload — switch on artifact.kind to render a rich live card instead
    // of the generic tool-result excerpt.
    const artifact = parseStrategyArtifact(event);
    if (artifact?.kind === 'strategy_draft') {
      return <StrategyDraftCard artifact={artifact} onSendMessage={onSendMessage} />;
    }
    if (artifact?.kind === 'strategy_activation') {
      return (
        <StrategyActivationCard
          artifact={artifact}
          onApproveAction={onApproveAction}
          onRejectAction={onRejectAction}
          resolvedStatus={approvalStatusById?.[artifact.pendingActionId]}
        />
      );
    }
    return <ToolResultCard event={event} />;
  }
  if (event.type === 'artifact_created') return <ArtifactCard event={event} />;
  if (event.type === 'approval_request') {
    const meta = event.metadata ?? {};
    const toolName = typeof meta.toolName === 'string' ? meta.toolName : 'action';
    return <StatusLine icon={AlertCircle} text={`Approval needed for ${toolName}`} tone="amber" />;
  }
  if (event.type === 'scheduled_action') {
    return <StatusLine icon={CalendarClock} text={event.content || 'Scheduled action queued'} tone="sky" />;
  }
  if (event.type === 'status_change') {
    return <StatusLine icon={CheckCircle2} text={event.content || 'Mission status updated'} tone="gray" />;
  }
  if (event.type === 'error') {
    return <StatusLine icon={XCircle} text={event.content || 'An error occurred'} tone="rose" />;
  }
  return null;
}

function LiveMessageRow({
  message,
  missionAgentId,
  userInitials,
}: {
  message: CoreMessage;
  missionAgentId?: string;
  userInitials: string;
}) {
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string' ? message.content : '';
  if (!content.trim()) return null;
  const specialist = (missionAgentId || 'general').toLowerCase();
  return (
    <MessageBubble
      isUser={isUser}
      initials={userInitials}
      name={isUser ? 'You' : 'Agent'}
      specialist={isUser ? undefined : specialist}
      specialistClass={isUser ? undefined : getSpecialistBadgeClass(specialist)}
      time="just now"
      content={content}
    />
  );
}
