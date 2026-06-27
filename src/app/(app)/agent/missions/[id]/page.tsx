'use client';

import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronDown, CheckCircle2, Clock, AlertCircle, Pause,
  ChevronRight, ExternalLink, RefreshCw, Zap, BarChart2, GitBranch,
  type LucideIcon,
} from 'lucide-react';
import {
  Card,
  Chip,
  Button,
  IconButton,
  Meter,
  Skeleton,
  EmptyState,
} from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

// ─── Types (local — mirrors DB models) ───────────────────────────────────────

interface MissionEvent {
  _id: string;
  type: string;
  role?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface MissionLink {
  _id: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  targetRoute?: string;
}

interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked';
}

interface SubMission {
  _id: string;
  title: string;
  status: string;
  activeAgentId: string;
  createdAt: string;
}

interface Mission {
  _id: string;
  title: string;
  summary: string;
  status: string;
  mode: string;
  activeAgentId: string;
  parentMissionId?: string;
  lastActivityAt: string;
  createdAt: string;
  limits: { maxCredits: number; maxTokens: number; maxToolCalls: number };
  usage: { credits: number; tokens: number; toolCalls: number };
  plan?: { goal?: string; steps: PlanStep[] };
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: LucideIcon; tone: ChipTone }> = {
  active:    { label: 'Active',    icon: Zap,          tone: 'ok' },
  waiting:   { label: 'Waiting',   icon: Pause,        tone: 'warn' },
  completed: { label: 'Completed', icon: CheckCircle2, tone: 'info' },
  blocked:   { label: 'Blocked',   icon: AlertCircle,  tone: 'danger' },
  draft:     { label: 'Draft',     icon: Clock,        tone: 'gray' },
  scheduled: { label: 'Scheduled', icon: Clock,        tone: 'purple' },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  message:          'Message',
  plan_step:        'Plan step',
  tool_call:        'Tool call',
  tool_result:      'Tool result',
  approval_request: 'Approval request',
  artifact_created: 'Artifact',
  scheduled_action: 'Scheduled',
  status_change:    'Status change',
  error:            'Error',
};

const STEP_STATUS_CLASSES: Record<string, string> = {
  pending:     'text-muted-foreground',
  in_progress: 'text-info',
  done:        'text-success',
  skipped:     'text-muted-foreground line-through',
  blocked:     'text-danger',
};

const STEP_STATUS_TONE: Record<string, ChipTone> = {
  pending:     'gray',
  in_progress: 'info',
  done:        'ok',
  skipped:     'gray',
  blocked:     'danger',
};

// ─── Detail load state ──────────────────────────────────────────────────────

interface DetailState {
  mission: Mission | null;
  events: MissionEvent[];
  links: MissionLink[];
  subMissions: SubMission[];
  loading: boolean;
  error: string | null;
}

type DetailAction =
  | { type: 'loaded'; data: { mission: Mission; events: MissionEvent[]; links: MissionLink[]; subMissions: SubMission[] }; silent: boolean }
  | { type: 'not_found' }
  | { type: 'error' };

const initialDetailState: DetailState = {
  mission: null,
  events: [],
  links: [],
  subMissions: [],
  loading: true,
  error: null,
};

function detailReducer(state: DetailState, action: DetailAction): DetailState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        mission: action.data.mission,
        events: action.data.events,
        links: action.data.links,
        subMissions: action.data.subMissions,
        loading: action.silent ? state.loading : false,
      };
    case 'not_found':
      return { ...state, error: 'Mission not found' };
    case 'error':
      return { ...state, error: 'Failed to load mission', loading: false };
    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { back, push } = useRouter();

  const [{ mission, events, links, subMissions, loading, error }, dispatch] = useReducer(detailReducer, initialDetailState);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLiveRef = useRef(false);

  const fetchDetail = useCallback(async (silent = false) => {
    try {
      const res = await fetch(`/api/v2/agent/missions/${id}`);
      if (!res.ok) { dispatch({ type: 'not_found' }); return; }
      const data = await res.json();
      dispatch({
        type: 'loaded',
        data: {
          mission: data.mission,
          events: data.events ?? [],
          links: data.links ?? [],
          subMissions: data.subMissions ?? [],
        },
        silent,
      });

      // Auto-scroll events to bottom on fresh load.
      if (!silent && scrollRef.current) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }, 100);
      }

      // Keep polling only while mission is live.
      const live = ['active', 'waiting', 'scheduled'].includes(data.mission?.status ?? '');
      isLiveRef.current = live;
      if (!live && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      if (!silent) { dispatch({ type: 'error' }); }
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
    // Poll every 4s while mission is live.
    pollRef.current = setInterval(() => {
      if (isLiveRef.current) fetchDetail(true);
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchDetail]);

  // Auto-scroll events list when new events arrive.
  const prevEventCount = useRef(0);
  useEffect(() => {
    if (events.length > prevEventCount.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevEventCount.current = events.length;
  }, [events.length]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="col-span-2 h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertCircle}
          title={error ?? 'Mission not found'}
          cta={<Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => back()}>Go back</Button>}
        />
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[mission.status] ?? STATUS_CONFIG.draft;

  const creditPct = mission.limits.maxCredits > 0
    ? Math.min(100, Math.round((mission.usage.credits / mission.limits.maxCredits) * 100))
    : 0;
  const toolPct = mission.limits.maxToolCalls > 0
    ? Math.min(100, Math.round((mission.usage.toolCalls / mission.limits.maxToolCalls) * 100))
    : 0;

  const planSteps = mission.plan?.steps ?? [];
  const donePlanSteps = planSteps.filter(s => s.status === 'done').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <IconButton icon={ArrowLeft} iconSize={16} aria-label="Go back" className="shrink-0" onClick={() => back()} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{mission.title}</h1>
            <Chip tone={statusCfg.tone} icon={statusCfg.icon}>{statusCfg.label}</Chip>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{mission.summary}</p>
        </div>
        <Button variant="outline" size="sm" icon={RefreshCw} className="shrink-0" onClick={() => fetchDetail()}>
          Refresh
        </Button>
      </div>

      {/* Meta + Budget row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Meta */}
        <Card title="Mission Details" className="col-span-2">
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Mode</span>
                <p className="font-medium capitalize">{mission.mode}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Agent</span>
                <p className="font-medium">{mission.activeAgentId.replace(/-agent$/, '')}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Created</span>
                <p className="font-medium">{new Date(mission.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Last activity</span>
                <p className="font-medium">{new Date(mission.lastActivityAt).toLocaleTimeString()}</p>
              </div>
              {mission.parentMissionId && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Parent mission</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-auto px-0 text-brand-strong"
                    onClick={() => push(`/agent/missions/${mission.parentMissionId}`)}
                  >
                    {mission.parentMissionId}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Budget */}
        <Card icon={BarChart2} title="Budget">
          <div className="space-y-3 px-4 pb-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Credits</span>
                <span>{mission.usage.credits} / {mission.limits.maxCredits}</span>
              </div>
              <Meter value={creditPct} tone={creditPct >= 90 ? 'danger' : 'brand'} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tool calls</span>
                <span>{mission.usage.toolCalls} / {mission.limits.maxToolCalls}</span>
              </div>
              <Meter value={toolPct} tone={toolPct >= 90 ? 'danger' : 'brand'} />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tokens</span>
              <span>{mission.usage.tokens.toLocaleString()}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Plan steps */}
      {planSteps.length > 0 && (
        <Card
          title="Plan"
          action={<Chip tone="gray">{donePlanSteps}/{planSteps.length} done</Chip>}
        >
          <div className="px-4 pb-4">
            <ol className="space-y-2">
              {planSteps.map((step, i) => (
                <li key={step.id} className="flex items-start gap-2 text-sm">
                  <span className="w-5 shrink-0 pt-0.5 text-xs text-muted-foreground">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <span className={cn('font-medium', STEP_STATUS_CLASSES[step.status])}>{step.title}</span>
                    {step.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                    )}
                  </div>
                  <Chip tone={STEP_STATUS_TONE[step.status] ?? 'gray'} className="shrink-0">{step.status}</Chip>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      {/* Sub-missions tree (B1-4.4) */}
      {subMissions.length > 0 && (
        <Card
          icon={GitBranch}
          title="Sub-missions"
          action={<Chip tone="gray">{subMissions.length}</Chip>}
        >
          <div className="space-y-2 px-4 pb-4">
            {subMissions.map(sub => {
              const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.draft;
              return (
                <button
                  key={sub._id}
                  type="button"
                  onClick={() => push(`/agent/missions/${sub._id}`)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <Chip tone={cfg.tone} icon={cfg.icon} className="shrink-0">{cfg.label}</Chip>
                  <span className="flex-1 truncate text-sm font-medium">{sub.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {sub.activeAgentId.replace(/-agent$/, '')}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Timeline events */}
      <Card
        title="Timeline"
        action={
          <span className="flex items-center gap-2">
            <Chip tone="gray">{events.length} events</Chip>
            {isLiveRef.current && (
              <span className="flex items-center gap-1 text-xs text-success">
                <span className="size-1.5 animate-pulse rounded-full bg-success" />
                Live
              </span>
            )}
          </span>
        }
      >
        <div ref={scrollRef as React.RefObject<HTMLDivElement>} className="max-h-[26rem] space-y-2 overflow-y-auto px-4 pb-4">
          {events.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No events yet.</p>
          ) : (
            events.map(ev => (
              <EventRow key={ev._id} event={ev} />
            ))
          )}
        </div>
      </Card>

      {/* Links */}
      {links.length > 0 && (
        <Card title="Linked Resources">
          <div className="space-y-2 px-4 pb-4">
            {links.map(link => (
              <div key={link._id} className="flex items-center gap-2 text-sm">
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs uppercase text-muted-foreground">{link.targetType}</span>
                {link.targetRoute ? (
                  <a
                    href={link.targetRoute}
                    className="flex items-center gap-1 text-brand-strong underline underline-offset-2 hover:opacity-80"
                  >
                    {link.targetLabel ?? link.targetId}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span>{link.targetLabel ?? link.targetId}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── EventRow ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: MissionEvent }) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = EVENT_TYPE_LABELS[event.type] ?? event.type;
  const isAssistant = event.role === 'assistant';
  const isSystem = event.role === 'system' || !event.role;
  const isError = event.type === 'error';

  const roleTone: ChipTone = isError ? 'danger' : isAssistant ? 'info' : isSystem ? 'gray' : 'ok';

  return (
    <div
      className={cn(
        'rounded-md border text-xs',
        isError ? 'border-danger/25 bg-danger-muted' : 'border-border bg-muted/30',
      )}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Chip tone={roleTone} className="h-5 shrink-0 px-1.5 text-[10px] uppercase tracking-wide">
          {event.role ?? 'sys'}
        </Chip>
        <span className="shrink-0 text-muted-foreground">{typeLabel}</span>
        <span className="flex-1 truncate text-foreground">
          {event.content?.slice(0, 120) ?? '—'}
        </span>
        <span className="ml-1 shrink-0 text-muted-foreground">
          {new Date(event.createdAt).toLocaleTimeString()}
        </span>
        {(event.content && event.content.length > 120) || event.metadata ? (
          <ChevronDown className={cn('size-3 shrink-0 transition-transform', expanded && 'rotate-180')} />
        ) : null}
      </button>
      {expanded && (
        <div className="space-y-1 border-t border-border px-3 py-2">
          {event.content && (
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
              {event.content}
            </pre>
          )}
          {event.metadata && (
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
