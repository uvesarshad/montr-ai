'use client';

/**
 * Dashboard Home — composed entirely from the ui-kit. Every data section is
 * prop-driven by page.tsx's real hooks; absent/empty values resolve to honest
 * zeros + empty states (NO fabricated "sample" data — 2026-06-30). The hero shows
 * REAL metrics only: open pipeline + stage breakdown (CRM), closed-won (CRM), ads
 * spend (useAdsSpend, when ad accounts are synced), AI credits used, and the real
 * plan. There is no fabricated revenue / "net saved" / demo team.
 */

import * as React from 'react';
import {
  Activity,
  ArrowUp,
  Bot,
  Building2,
  Check,
  ChevronRight,
  DollarSign,
  FileText,
  Image as ImageIcon,
  Inbox,
  Mail,
  MessageCircle,
  MonitorPlay,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  AreaChart,
  Avatar,
  Button,
  Card,
  Chip,
  Donut,
  EmptyState,
  KpiTile,
  StatCard,
} from '@/components/ui-kit';

export type AgentTask = { status: string; tone: 'brand' | 'ok' | 'gray'; title: string; tags: string; pct: number };
export type PipelineRow = { name: string; total: number; color: string };
export type AutomationRow = { title: string; active: boolean; runs: string };
export type DocFormRow = { title: string; sub: string; badge?: string | null; tone?: 'purple' | 'gray' | null };
export type InboxRow = { name: string; preview: string; time: string; channel: 'whatsapp' | 'email' | 'social' };
export type ScheduledPost = { title: string; date: string };

export interface DashboardHomeData {
  firstName: string;
  dateLabel: string;
  kpis?: { pipeline: string; won: string; conversations: string; credits: string };
  creditSegments?: { value: number; color: string; label: string }[];
  creditsLeftLabel?: string;
  creditPlan?: string;
  resetsLabel?: string;
  agentTasks?: AgentTask[];
  agentSummary?: { running: number; queued: number };
  crmPipeline?: PipelineRow[];
  crmOpenLabel?: string;
  crmDealsLabel?: string;
  automations?: AutomationRow[];
  automationsSummary?: { active: number; paused: number };
  docsAndForms?: DocFormRow[];
  docsFormsSummary?: string;
  socialStats?: { impressions: string; engagements: string; ctr: string; published: string };
  scheduledPosts?: ScheduledPost[];
  inbox?: InboxRow[];
  teamNames?: string[];
  activitySeries?: { name: string; color: string; data: number[] }[];
  activityLabels?: { x: number; t: string }[];
  onGo?: (href: string) => void;
  onAskAI?: () => void;
  onLaunchAgent?: () => void;
}


const CHANNEL_ICON: Record<InboxRow['channel'], LucideIcon> = {
  whatsapp: MessageCircle,
  email: Mail,
  social: Share2,
};

/* ------------------------------------------------------------ finance hero */

/**
 * Open-pipeline overview, backed by REAL CRM stage data (no fabricated revenue).
 * Shows the live open-pipeline value + a per-stage bar breakdown; on a fresh
 * tenant with no deals it renders an empty state rather than sample numbers.
 */
function BalanceOverview({ openValue, dealsLabel, stages }: { openValue: string; dealsLabel?: string; stages: PipelineRow[] }) {
  const H = 168;
  const hasData = stages.some((s) => s.total > 0);
  const maxT = Math.max(...stages.map((s) => s.total), 1);
  return (
    <Card>
      <div className="flex items-start justify-between px-[18px] pb-1.5 pt-4">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[30px] font-semibold tracking-[-0.035em]">{openValue}</span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            Open pipeline{dealsLabel ? ` · ${dealsLabel}` : ' · by stage'}
          </div>
        </div>
        <Button size="sm" iconRight={ChevronRight} onClick={undefined}>
          CRM
        </Button>
      </div>
      {hasData ? (
        <div className="flex items-end gap-2 px-[18px] pb-4" style={{ height: H + 38 }}>
          {stages.map((s) => (
            <div key={s.name} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-col justify-end" style={{ height: H }}>
                <span style={{ height: `${(s.total / maxT) * H}px`, background: s.color, borderRadius: '5px 5px 0 0' }} />
              </div>
              <span className="w-full truncate text-center text-[11px] font-semibold text-foreground">{s.total}</span>
              <span className="w-full truncate text-center text-[10.5px] text-muted-foreground">{s.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="No deals yet"
          note="Add deals in CRM and your open-pipeline overview appears here."
          className="px-[18px] py-12"
        />
      )}
    </Card>
  );
}

/** Real ads spend (last 30d vs previous 30d) when ad accounts are synced. */
function useAdsSpend() {
  const [spend, setSpend] = React.useState<{ value: string; delta: string; up: boolean } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const dateKey = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fetchSpend = async (from: number, to: number) => {
      const sum = async (sourceType: string) => {
        const response = await fetch(
          `/api/v2/analytics/summary?sourceType=${sourceType}&dateFrom=${dateKey(from)}&dateTo=${dateKey(to)}`,
        );
        if (!response.ok) return 0;
        const data = await response.json();
        return data.totals?.spend || 0;
      };
      const [meta, google] = await Promise.all([sum('meta_ads'), sum('google_ads')]);
      return meta + google;
    };

    (async () => {
      try {
        const [current, previous] = await Promise.all([fetchSpend(29, 0), fetchSpend(59, 30)]);
        if (cancelled || current <= 0) return; // keep the sample card without data
        const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : null;
        setSpend({
          value: `$${Math.round(current).toLocaleString()}`,
          delta: deltaPct === null ? '—' : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`,
          // Spend going DOWN is the "good" direction on this card
          up: deltaPct !== null ? deltaPct <= 0 : true,
        });
      } catch {
        /* sample fallback */
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return spend;
}

/** Real platform money stats — closed-won (CRM), ads spend (when connected),
 *  and AI credits used. No fabricated revenue / "net saved". */
function StatStack({ wonValue, creditsUsedLabel }: { wonValue: string; creditsUsedLabel: string }) {
  const adsSpend = useAdsSpend();
  const stats: { label: string; value: string; sub: React.ReactNode; up?: boolean }[] = [
    { label: 'Closed won', value: wonValue, sub: <span className="font-normal text-muted-foreground">from your CRM</span> },
    adsSpend
      ? {
          label: 'Ads spend · 30d',
          value: adsSpend.value,
          up: adsSpend.up,
          sub: <>{adsSpend.delta} <span className="font-normal text-muted-foreground">vs prior 30d</span></>,
        }
      : { label: 'Ads spend', value: '—', sub: <span className="font-normal text-muted-foreground">connect ad accounts</span> },
    { label: 'AI credits used', value: creditsUsedLabel, sub: <span className="font-normal text-muted-foreground">this period</span> },
  ];
  return (
    // Mockup `.hero-stats` — 4px/18px padding, no dividers between stats.
    <Card className="justify-center px-[18px] py-1">
      <div>
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} up={s.up} delta={s.sub} />
        ))}
      </div>
    </Card>
  );
}

function PlanCard({
  plan = 'Free',
  workspace = 'Your workspace',
  team = [],
  renewsLabel,
}: { plan?: string; workspace?: string; team?: string[]; renewsLabel?: string }) {
  // Mockup `.plan-actions` — five tiles, each with a 30px icon square on top.
  const actions: [LucideIcon, string][] = [
    [ArrowUp, 'Upgrade'],
    [Zap, 'Top up'],
    [UserPlus, 'Invite'],
    [Activity, 'Usage'],
    [MoreHorizontal, 'More'],
  ];
  return (
    // Mockup `.hero-plan-wrap` — a transparent stack, NOT a card.
    <div className="flex flex-col justify-center gap-3">
      {/* `.plan-credit` — deep-violet gradient card with glow + inset sheen */}
      <div
        className="rounded-lg p-4 text-white"
        style={{
          backgroundImage:
            'linear-gradient(145deg, oklch(0.55 0.19 285), oklch(0.4 0.17 280) 55%, oklch(0.3 0.12 278))',
          boxShadow: '0 8px 24px oklch(0.4 0.17 280 / 0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11.5px]">Current plan</div>
            <div className="mt-1 text-[19px] font-semibold leading-none tracking-[-0.01em]">{plan}</div>
          </div>
          <span className="rounded-full bg-white/[0.18] px-2 py-[3px] text-[9.5px] font-bold tracking-[0.08em]">
            ACTIVE
          </span>
        </div>
        <div className="mt-5 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.06em] opacity-70">Workspace</div>
            <div className="text-[13px] font-semibold">{workspace}</div>
          </div>
          {renewsLabel ? (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.06em] opacity-70">Renews</div>
              <div className="font-mono text-[13px] font-semibold">{renewsLabel}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* `.plan-actions` — 5-up tile grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {actions.map(([Icon, label]) => (
          <button
            key={label}
            type="button"
            className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-card px-0.5 py-[9px] text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-muted text-foreground">
              <Icon className="size-3.5" />
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* team row */}
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-muted-foreground">
          {team.length ? 'Your team' : 'Invite your team'}
        </span>
        {team.length ? (
          <div className="flex">
            {team.slice(0, 5).map((t, i) => (
              <span key={t} className="rounded-full ring-2 ring-card" style={{ marginLeft: i ? -8 : 0, zIndex: team.length - i }}>
                <Avatar name={t} size={26} />
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="ml-auto grid size-6 place-items-center rounded-full border border-dashed border-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Invite teammate"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- onboarding checklist */

const ONB_DISMISS_KEY = 'montr-dash-onboarding-dismissed';

function OnboardingChecklist({ onGo }: { onGo: (href: string) => void }) {
  // Hidden until mounted to stay hydration-safe, then honor the stored dismissal.
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    setVisible(localStorage.getItem(ONB_DISMISS_KEY) !== '1');
  }, []);
  if (!visible) return null;

  const steps = [
    { icon: Building2, label: 'Set up workspace', done: true, href: '/settings' },
    { icon: Users, label: 'Import your contacts', done: false, href: '/crm/import' },
    { icon: Bot, label: 'Launch your first AI Agent', done: false, href: '/agent' },
    { icon: Share2, label: 'Connect a channel', done: false, href: '/inbox/channels' },
  ];
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const dismiss = () => {
    localStorage.setItem(ONB_DISMISS_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center gap-[13px] px-[18px] py-4">
        <div
          className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(hsl(var(--brand)) ${pct}%, hsl(var(--muted)) 0)` }}
        >
          <span className="grid size-9 place-items-center rounded-full bg-card font-mono text-[11.5px] font-bold">
            {pct}%
          </span>
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold">Finish setting up Montr</div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {done} of {steps.length} steps done — you&apos;re almost ready to go live.
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={X} onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
        {steps.map((s, i) => {
          const StepIcon = s.icon;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onGo(s.href)}
              className={cn(
                'px-3.5 py-[13px] text-left transition-colors hover:bg-muted/60',
                i !== 0 && 'border-l border-border',
              )}
            >
              <div
                className={cn(
                  'mb-[9px] grid size-5 place-items-center rounded-md',
                  s.done ? 'bg-success text-white' : 'border-[1.5px] border-border',
                )}
              >
                {s.done ? <Check className="h-[13px] w-[13px]" strokeWidth={3} /> : null}
              </div>
              <div className={cn('flex items-center gap-1.5', s.done ? 'text-muted-foreground' : 'text-foreground')}>
                <StepIcon className={cn('h-[15px] w-[15px]', s.done ? 'text-muted-foreground' : 'text-brand-strong')} />
                <span className={cn('text-[12.5px] font-semibold', s.done && 'line-through')}>{s.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- KPI tiles */

const KPI_TILES: { key: 'pipeline' | 'won' | 'conversations' | 'credits'; icon: LucideIcon; label: string; pastel: 'violet' | 'mint' | 'blue' | 'peach' }[] = [
  { key: 'pipeline', icon: TrendingUp, label: 'Open pipeline', pastel: 'violet' },
  { key: 'won', icon: DollarSign, label: 'Closed won · MTD', pastel: 'mint' },
  { key: 'conversations', icon: Inbox, label: 'Open conversations', pastel: 'blue' },
  { key: 'credits', icon: Zap, label: 'AI credits used', pastel: 'peach' },
];

/* --------------------------------------------------------------- module bits */

function CardLink({ label, onClick }: { label: string; onClick?: () => void }) {
  // Mockup `.linkbtn` — accent text, tint pill on hover (no underline).
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[5px] px-1 py-0.5 text-[12.5px] font-semibold text-brand-strong transition-colors hover:bg-brand-muted"
    >
      {label}
      <ChevronRight className="size-3" />
    </button>
  );
}

function ListRow({ children, onClick, first }: { children: React.ReactNode; onClick?: () => void; first?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      {...(onClick ? { type: 'button' as const } : {})}
      className={cn(
        'flex w-full items-center gap-2.5 px-4 py-[9px] text-left',
        !first && 'border-t border-border',
        onClick && 'transition-colors hover:bg-muted/60',
      )}
    >
      {children}
    </Comp>
  );
}

const AI_STUDIO_ROWS: [LucideIcon, string, string, string][] = [
  [ImageIcon, 'Image', 'Visuals & creative assets', '/ai-studio/image'],
  [MonitorPlay, 'Video', 'Storyboards & clips', '/ai-studio/video'],
  [Activity, 'Audio', 'Voice & sound', '/ai-studio/audio'],
  [User, 'Character', 'Personas & avatars', '/ai-studio/character'],
  [FileText, 'Text', 'Campaigns & briefs', '/ai-studio/text'],
];

function AiStudioCard({ go }: { go: (href: string) => void }) {
  return (
    <Card
      lift
      spotlight
      icon={ImageIcon}
      title="AI Studio"
      meta="this period"
      action={<CardLink label="Open" onClick={() => go('/ai-studio')} />}
      footer={
        <>
          <span>Text · Image · Video · Audio</span>
          <CardLink label="Open Studio" onClick={() => go('/ai-studio')} />
        </>
      }
    >
      <div>
        {AI_STUDIO_ROWS.map(([Icon, title, sub, href], i) => (
          <ListRow key={title} first={i === 0} onClick={() => go(href)}>
            <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-muted text-muted-foreground">
              <Icon className="h-[15px] w-[15px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{title}</span>
              <span className="text-[11.5px] text-muted-foreground">{sub}</span>
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </ListRow>
        ))}
      </div>
    </Card>
  );
}

function AutomationsCard({
  automations,
  automationsSummary,
  go,
}: {
  automations: AutomationRow[];
  automationsSummary: { active: number; paused: number };
  go: (href: string) => void;
}) {
  return (
    <Card
      lift
      spotlight
      icon={Workflow}
      title="Automations"
      meta={`${automations.length} recent`}
      action={<CardLink label="Open" onClick={() => go('/canvas')} />}
      footer={
        <>
          <span>
            {automationsSummary.active} active · {automationsSummary.paused} paused
          </span>
          <CardLink label="Open workspace" onClick={() => go('/canvas')} />
        </>
      }
    >
      {automations.length ? (
        <div>
          {automations.slice(0, 4).map((a, i) => (
            <ListRow key={a.title} first={i === 0}>
              <Workflow className="size-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{a.title}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{a.runs}</span>
              <Chip tone={a.active ? 'ok' : 'warn'} className="h-[19px] text-[10.5px]">
                {a.active ? 'Active' : 'Paused'}
              </Chip>
            </ListRow>
          ))}
        </div>
      ) : (
        <EmptyState icon={Workflow} title="No automations yet" note="Build a workflow on the canvas to automate your busywork." className="px-4 py-7" />
      )}
    </Card>
  );
}

function InboxCard({ inbox, go }: { inbox: InboxRow[]; go: (href: string) => void }) {
  return (
    <Card
      lift
      spotlight
      icon={Inbox}
      title="Omni-channel Inbox"
      meta="open"
      action={<CardLink label="Open" onClick={() => go('/inbox')} />}
      footer={
        <>
          <span>Recent conversations</span>
          <CardLink label="Open inbox" onClick={() => go('/inbox')} />
        </>
      }
    >
      {inbox.length ? (
        <div>
          {inbox.slice(0, 4).map((c, i) => {
            const Icon = CHANNEL_ICON[c.channel];
            return (
              <ListRow key={c.name} first={i === 0}>
                <Avatar name={c.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold">{c.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{c.preview}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-[10.5px] text-muted-foreground">{c.time}</span>
                  <span className="grid size-4 place-items-center rounded bg-muted text-muted-foreground">
                    <Icon className="size-2.5" />
                  </span>
                </span>
              </ListRow>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Inbox} title="Inbox is quiet" note="Connect a channel and new conversations land here." className="px-4 py-7" />
      )}
    </Card>
  );
}

function DocsFormsCard({
  docsAndForms,
  docsFormsSummary,
  go,
}: {
  docsAndForms: DocFormRow[];
  docsFormsSummary: string;
  go: (href: string) => void;
}) {
  return (
    <Card
      lift
      spotlight
      icon={FileText}
      title="Docs & Forms"
      meta="recent"
      action={<CardLink label="Open" onClick={() => go('/docs')} />}
      footer={
        <>
          <span>{docsFormsSummary}</span>
          <CardLink label="Open Forms" onClick={() => go('/forms')} />
        </>
      }
    >
      {docsAndForms.length ? (
        <div>
          {docsAndForms.slice(0, 4).map((r, i) => (
            <ListRow key={`${r.title}-${i}`} first={i === 0}>
              <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-muted text-muted-foreground">
                <FileText className="h-[15px] w-[15px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{r.title}</span>
                <span className="text-[11px] text-muted-foreground">{r.sub}</span>
              </span>
              {r.tone && r.badge ? (
                <Chip tone={r.tone} className="h-[19px] text-[10.5px]">
                  {r.badge}
                </Chip>
              ) : null}
            </ListRow>
          ))}
        </div>
      ) : (
        <EmptyState icon={FileText} title="Nothing here yet" note="Create a doc or build a form to get started." className="px-4 py-7" />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------- Home */

export function DashboardHome(props: DashboardHomeData) {
  // Real data only — every field is fed by the page's live hooks. Absent/empty
  // values resolve to honest zeros/empty states (no fabricated "demo" data).
  const go = props.onGo ?? (() => { });
  const kpis = props.kpis ?? { pipeline: '$0', won: '$0', conversations: '—', credits: '—' };
  const creditSegments = props.creditSegments ?? [];
  const creditsLeft = props.creditsLeftLabel ?? '—';
  const creditPlan = props.creditPlan ?? 'Free';
  const resetsLabel = props.resetsLabel ?? '—';
  const agentTasks = props.agentTasks ?? [];
  const agentSummary = props.agentSummary ?? { running: 0, queued: 0 };
  const crmPipeline = props.crmPipeline ?? [];
  const crmOpenLabel = props.crmOpenLabel ?? '$0 open';
  const crmDealsLabel = props.crmDealsLabel ?? 'No deals yet';
  const automations = props.automations ?? [];
  const automationsSummary = props.automationsSummary ?? { active: 0, paused: 0 };
  const docsAndForms = props.docsAndForms ?? [];
  const docsFormsSummary = props.docsFormsSummary ?? '0 docs · 0 forms';
  const socialStats = props.socialStats;
  const scheduledPosts = props.scheduledPosts ?? [];
  const inbox = props.inbox ?? [];

  const maxStage = Math.max(...crmPipeline.map((s) => s.total), 1);
  const openPipelineValue = crmOpenLabel.replace(/\s*open\s*$/i, '');

  const activitySeries = props.activitySeries ?? [];
  const xlabels = props.activityLabels ?? [];
  const hasActivity = activitySeries.some((s) => s.data.some((v) => v > 0));

  return (
    <div className="flex flex-col gap-[14px] px-6 pb-9 pt-5">
      {/* greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ace-grad-text text-[24px] font-semibold tracking-[-0.03em]">
            Good morning, {props.firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s everything moving across your workspace today — {props.dateLabel}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={Sparkles} onClick={props.onAskAI}>
            Ask Montr AI
          </Button>
          <Button variant="brand" icon={Bot} onClick={props.onLaunchAgent}>
            Launch Agent
          </Button>
        </div>
      </div>

      {/* onboarding checklist */}
      <OnboardingChecklist onGo={go} />

      {/* hero */}
      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[1.85fr_0.9fr_1.15fr]">
        <BalanceOverview openValue={openPipelineValue} dealsLabel={crmDealsLabel} stages={crmPipeline} />
        <StatStack wonValue={kpis.won} creditsUsedLabel={kpis.credits} />
        <PlanCard plan={creditPlan} renewsLabel={resetsLabel !== '—' ? resetsLabel : undefined} team={props.teamNames ?? []} />
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_TILES.map((t) => (
          <KpiTile key={t.key} icon={t.icon} label={t.label} value={kpis[t.key]} pastel={t.pastel} />
        ))}
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.85fr_1fr]">
        <Card
          icon={Activity}
          title="Workspace activity"
          meta="last 14 days"
          action={hasActivity ? <CardLink label="Details" /> : undefined}
          footer={
            hasActivity ? (
              <span className="flex items-center gap-4">
                {activitySeries.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5">
                    <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: s.color }} />
                    <span className="font-medium">{s.name}</span>
                  </span>
                ))}
              </span>
            ) : undefined
          }
        >
          {hasActivity ? (
            <div className="min-h-[180px] px-3.5 pt-2">
              <AreaChart series={activitySeries} labels={xlabels} />
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              note="Conversations and AI generations will chart here as your workspace gets busy."
              className="min-h-[180px] px-4 py-10"
            />
          )}
        </Card>

        <Card
          icon={Zap}
          title="Credit usage"
          meta={creditPlan}
          footer={
            <>
              <span className="flex items-center gap-1">
                <RefreshCw className="size-3" /> Resets {resetsLabel}
              </span>
              <CardLink label="Upgrade" onClick={() => go('/settings?tab=billing')} />
            </>
          }
        >
          {creditSegments.length ? (
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="relative shrink-0">
                <Donut segments={creditSegments} />
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="font-mono text-xl font-semibold tracking-[-0.02em]">{creditsLeft}</div>
                    <div className="text-[10.5px] text-muted-foreground">left</div>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {creditSegments.map((b) => (
                  <div key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="size-2 shrink-0 rounded-[2px]" style={{ background: b.color }} />
                    <span className="truncate text-muted-foreground">{b.label}</span>
                    <span className="ml-auto font-mono font-semibold">{(b.value / 1000).toFixed(1)}k</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Zap}
              title="No usage yet"
              note="Your AI credit usage by feature appears here once you start creating."
              className="px-4 py-8"
            />
          )}
        </Card>
      </div>

      {/* AI agent live */}
      <Card className="[background:radial-gradient(120%_140%_at_0%_0%,hsl(var(--brand-muted))_0%,transparent_45%),hsl(var(--card))]">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Chip tone="ok" dot>
            LIVE
          </Chip>
          <span className="text-sm font-semibold">AI Agent</span>
          <span className="text-[12.5px] text-muted-foreground">
            {agentSummary.running} running · {agentSummary.queued} queued
          </span>
          <span className="ml-auto" />
          <CardLink label="View all" onClick={() => go('/agent')} />
        </div>
        {agentTasks.length ? (
          <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {agentTasks.slice(0, 3).map((a) => (
              <div key={a.title} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <Chip tone={a.tone} className="h-[19px] text-[10.5px]">
                    {a.status}
                  </Chip>
                  <span className="font-mono text-[11px] text-muted-foreground">{a.pct ? `${a.pct}%` : '—'}</span>
                </div>
                <div className="mb-1 mt-2.5 line-clamp-1 text-[13.5px] font-semibold leading-snug">{a.title}</div>
                <div className="mb-2.5 text-[11.5px] text-muted-foreground">{a.tags}</div>
                <span className="block h-[5px] overflow-hidden rounded-[4px] bg-muted">
                  <span className="block h-full rounded-[4px] bg-brand" style={{ width: `${a.pct}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bot}
            title="No missions running"
            note="Launch the agent with a goal and active missions show up here."
            className="py-9"
          />
        )}
      </Card>

      {/* module bird's-eye — row A */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card
          lift
          spotlight
          icon={TrendingUp}
          title="CRM"
          meta={crmDealsLabel}
          action={<CardLink label="Open" onClick={() => go('/crm')} />}
          footer={
            <>
              <span>{crmOpenLabel}</span>
              <CardLink label="All deals" onClick={() => go('/crm/deals')} />
            </>
          }
        >
          {crmPipeline.length ? (
            <div className="px-4 pb-1.5 pt-3">
              <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Sales pipeline</div>
              <div className="flex flex-col gap-2.5">
                {crmPipeline.map((s) => (
                  <div key={s.name} className="flex items-center gap-2.5 text-xs">
                    <span className="w-[74px] truncate text-muted-foreground">{s.name}</span>
                    <span className="h-[7px] flex-1 overflow-hidden rounded-[4px] bg-muted">
                      <span className="block h-full rounded-[4px]" style={{ width: `${(s.total / maxStage) * 100}%`, background: s.color }} />
                    </span>
                    <span className="w-[52px] text-right font-mono font-semibold">{s.total ? s.total : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="No deals yet" note="Add contacts and deals to see your pipeline." className="px-4 py-7" />
          )}
        </Card>

        <Card
          lift
          spotlight
          icon={Share2}
          title="Social Media"
          meta={`${scheduledPosts.length} scheduled`}
          action={<CardLink label="Calendar" onClick={() => go('/social')} />}
          footer={
            <>
              <span>{scheduledPosts.length ? `${scheduledPosts.length} scheduled` : 'Plan your first post'}</span>
              <CardLink label="Create post" onClick={() => go('/social/create-post')} />
            </>
          }
        >
          {socialStats ? (
            <div className="grid grid-cols-2 gap-px bg-border">
              {[
                ['Impressions', socialStats.impressions],
                ['Engagements', socialStats.engagements],
                ['Avg. CTR', socialStats.ctr],
                ['Published', socialStats.published],
              ].map((s) => (
                <div key={s[0]} className="bg-card px-3.5 py-2.5">
                  <div className="text-[19px] font-semibold tracking-[-0.02em]">{s[1]}</div>
                  <div className="text-[11.5px] text-muted-foreground">{s[0]}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Share2} title="No social data yet" note="Connect a channel and publish to see reach + engagement." className="px-4 py-7" />
          )}
          {scheduledPosts.slice(0, 2).map((p, i) => (
            <ListRow key={p.title} first={i === 0}>
              <span className="h-6 w-[3px] rounded-[3px] bg-brand" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{p.title}</span>
                <span className="text-[11px] text-muted-foreground">{p.date}</span>
              </span>
              <Chip tone="info" className="h-[19px] text-[11px]">
                Scheduled
              </Chip>
            </ListRow>
          ))}
        </Card>

        <AiStudioCard go={go} />
      </div>

      {/* module bird's-eye — row B */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <AutomationsCard automations={automations} automationsSummary={automationsSummary} go={go} />

        <InboxCard inbox={inbox} go={go} />

        <DocsFormsCard docsAndForms={docsAndForms} docsFormsSummary={docsFormsSummary} go={go} />
      </div>
    </div>
  );
}
