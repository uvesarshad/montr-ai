'use client';

import { useState, useEffect, useCallback, useReducer } from 'react';
import { StatsCard } from './stats-card';
import { DealFunnel } from './deal-funnel';
import { ActivityChart } from './activity-chart';
import { Leaderboard } from './leaderboard';
import { RecentActivityList } from './recent-activity-list';
import { buildDashboardInsights } from '@/lib/crm/ai-insights';
import { Activity } from '@/types/crm';
import {
  Users,
  Building2,
  Target,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { openAgentLauncher } from '@/lib/agent/launcher';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  CRM_WIDGET_BY_KEY,
  defaultDashboard,
  mergeDashboard,
  widgetColSpan,
  type CrmWidget,
} from './widget-catalog';

interface OverviewStats {
  contacts: {
    total: number;
    thisMonth: number;
    change: number;
    changeType: 'increase' | 'decrease' | 'neutral';
  };
  companies: {
    total: number;
    thisMonth: number;
    change: number;
    changeType: 'increase' | 'decrease' | 'neutral';
  };
  activeDeals: {
    count: number;
    value: number;
  };
  wonDeals: {
    count: number;
    value: number;
  };
  lostDeals: {
    count: number;
  };
  tasks: {
    total: number;
    overdue: number;
  };
}

interface DealStats {
  byStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
    value: number;
  }>;
}

interface ActivityStats {
  timeline: Array<{
    date: string;
    count: number;
    completed: number;
  }>;
  upcomingActivities: Activity[];
}

interface ForecastData {
  period: 'month' | 'quarter';
  periods: Array<{
    period: string;
    weighted: number;
    bestCase: number;
    committed: number;
    counts: { committed: number; open: number };
  }>;
  overdue: { count: number; value: number };
}

interface LeaderboardData {
  leaderboard: Array<{
    userId: string;
    userName: string;
    userAvatar?: string;
    dealsWon: number;
    dealValue: number;
    activitiesCompleted: number;
    winRate: number;
    rank: number;
  }>;
  period: string;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

interface DashboardDataState {
  overviewStats: OverviewStats | null;
  dealStats: DealStats | null;
  activityStats: ActivityStats | null;
  leaderboardData: LeaderboardData | null;
  forecastData: ForecastData | null;
  error: string | null;
}

type DashboardDataAction =
  | {
      type: 'loaded';
      overview: OverviewStats;
      deals: DealStats;
      activities: ActivityStats;
      leaderboard: LeaderboardData;
      forecast: ForecastData;
    }
  | { type: 'error'; error: string }
  | { type: 'clearError' };

const initialDashboardData: DashboardDataState = {
  overviewStats: null,
  dealStats: null,
  activityStats: null,
  leaderboardData: null,
  forecastData: null,
  error: null,
};

function dashboardDataReducer(
  state: DashboardDataState,
  action: DashboardDataAction
): DashboardDataState {
  switch (action.type) {
    case 'loaded':
      return {
        overviewStats: action.overview,
        dealStats: action.deals,
        activityStats: action.activities,
        leaderboardData: action.leaderboard,
        forecastData: action.forecast,
        error: null,
      };
    case 'error':
      return { ...state, error: action.error };
    case 'clearError':
      return { ...state, error: null };
    default:
      return state;
  }
}

type DashboardInsight = ReturnType<typeof buildDashboardInsights>[number];

function AiInsightsWidget({
  insights,
  gridClassName,
  push,
  openAgent,
  periodLabel,
}: {
  insights: DashboardInsight[];
  gridClassName: string;
  push: (href: string) => void;
  openAgent: (prompt: string, notes?: string[]) => void;
  periodLabel: string;
}) {
  return (
    <div className={cn('grid gap-3', gridClassName)}>
      {insights.map((insight) => (
        <div
          key={insight.id}
          className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
                {insight.metric}
              </div>
              <div className="mt-1 text-[13px] font-semibold">{insight.title}</div>
            </div>
            <div className="flex-shrink-0 rounded-full bg-primary/10 p-1.5 text-primary">
              <Sparkles className="size-3" />
            </div>
          </div>
          <p className="text-[12px] leading-[1.55] text-muted-foreground">{insight.summary}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-7 rounded-[7px] text-[11px]"
              onClick={() => push(insight.href)}
            >
              Open Queue
              <ArrowRight className="ml-1.5 size-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-[7px] text-[11px]"
              onClick={() => openAgent(insight.prompt, [`Insight: ${insight.title}`])}
            >
              <Sparkles className="mr-1.5 size-3" />
              {insight.actionLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-[7px] text-[11px]"
              onClick={() =>
                openAgent(
                  `Create a CRM automation from this dashboard insight.\n\nInsight: ${insight.title}\nContext: ${insight.summary}\n\nBuild the workflow steps, trigger, conditions, and owner notifications.`,
                  [`Insight: ${insight.title}`, `Period: ${periodLabel}`]
                )
              }
            >
              Automate
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryWidget({
  overviewStats,
  periodLabel,
}: {
  overviewStats: OverviewStats;
  periodLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start md:items-center gap-3.5">
        <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-primary/10 text-primary">
          <TrendingUp className="size-4" />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-foreground">
            {overviewStats?.wonDeals && overviewStats.wonDeals.count > 0 ? 'Outstanding quarter!' : 'Let\'s pipeline those conversions!'}
          </div>
          <p className="mt-1 text-[12px] leading-[1.55] text-muted-foreground max-w-3xl">
            {overviewStats?.wonDeals && overviewStats.wonDeals.count > 0 ? (
              <>
                You&apos;ve secured <strong className="text-foreground">{overviewStats.wonDeals.count}</strong> deals totaling{' '}
                <strong className="text-emerald-500">{formatCurrency(overviewStats.wonDeals.value)}</strong> {periodLabel.toLowerCase()}.
                {overviewStats?.tasks && overviewStats.tasks.overdue > 0 && (
                  <> However, you have <strong className="text-red-500">{overviewStats.tasks.overdue}</strong> overdue tasks pending.</>
                )}
              </>
            ) : (
              <>Start importing leads or manually adding organizations to construct your pipeline visualizer.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function ForecastWidget({
  forecastData,
  push,
}: {
  forecastData: ForecastData;
  push: (href: string) => void;
}) {
  const next = forecastData.periods.slice(0, 3);
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
          <TrendingUp className="size-3.5" />
        </div>
        <span className="text-[13px] font-semibold">Sales Forecast</span>
        <button
          type="button"
          onClick={() => push('/crm/reports')}
          className="ml-auto text-[11px] font-medium text-primary hover:underline"
        >
          View report
        </button>
      </div>
      {forecastData.overdue.count > 0 && (
        <p className="mb-2 text-[11px] text-red-500">
          {forecastData.overdue.count} overdue · {formatCurrency(forecastData.overdue.value)} at risk
        </p>
      )}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-1 text-left font-semibold">Month</th>
            <th className="pb-1 text-right font-semibold">Weighted</th>
            <th className="pb-1 text-right font-semibold">Best case</th>
          </tr>
        </thead>
        <tbody>
          {next.map((p) => (
            <tr key={p.period} className="border-t border-border/60">
              <td className="py-1.5 text-foreground">
                {new Date(p.period).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })}
              </td>
              <td className="py-1.5 text-right font-mono text-primary">{formatCurrency(p.weighted)}</td>
              <td className="py-1.5 text-right font-mono text-muted-foreground">{formatCurrency(p.bestCase)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CrmOverview() {
  const { push } = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  const [
    { overviewStats, dealStats, activityStats, leaderboardData, forecastData, error },
    dispatchData,
  ] = useReducer(dashboardDataReducer, initialDashboardData);

  // ── Composable dashboard (per-user widget list) ──────────────────────────
  const [widgets, setWidgets] = useState<CrmWidget[]>(defaultDashboard());
  const [draft, setDraft] = useState<CrmWidget[]>(defaultDashboard());
  const [editing, setEditing] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/crm/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const merged = mergeDashboard(data.widgets);
      setWidgets(merged);
    } catch {
      setWidgets(defaultDashboard());
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      dispatchData({ type: 'clearError' });

      const fetchWithCheck = async (url: string) => {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch ${url}`);
        return res.json();
      };

      const [overview, deals, activities, leaderboard, forecast] = await Promise.all([
        fetchWithCheck('/api/v2/crm/stats/overview'),
        fetchWithCheck('/api/v2/crm/stats/deals'),
        fetchWithCheck('/api/v2/crm/stats/activities'),
        fetchWithCheck(`/api/v2/crm/stats/leaderboard?period=${period}`),
        fetchWithCheck('/api/v2/crm/stats/forecast?period=month&horizon=3'),
      ]);

      dispatchData({ type: 'loaded', overview, deals, activities, leaderboard, forecast });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      dispatchData({ type: 'error', error: 'Failed to load dashboard data' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openAgent = (prompt: string, notes: string[] = []) => {
    openAgentLauncher({
      prompt,
      context: {
        source: 'crm_overview',
        entityType: 'dashboard',
        entityLabel: getPeriodLabel(),
        route: '/crm',
        notes: notes.filter((note): note is string => Boolean(note)),
      },
    });
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'week':
        return 'This Week';
      case 'quarter':
        return 'This Quarter';
      case 'year':
        return 'This Year';
      case 'month':
      default:
        return 'This Month';
    }
  };

  // ── Edit-mode controls ───────────────────────────────────────────────────
  const enterEdit = () => {
    setDraft(widgets.map((w) => ({ ...w })));
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);

  const orderedDraft = [...draft].sort((a, b) => a.order - b.order);

  const moveWidget = (key: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const ordered = [...prev].sort((a, b) => a.order - b.order);
      const idx = ordered.findIndex((w) => w.key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= ordered.length) return prev;
      const a = ordered[idx];
      const b = ordered[target];
      return prev.map((w) => {
        if (w.key === a.key) return { ...w, order: b.order };
        if (w.key === b.key) return { ...w, order: a.order };
        return w;
      });
    });
  };

  const hideWidget = (key: string) =>
    setDraft((prev) => prev.map((w) => (w.key === key ? { ...w, visible: false } : w)));

  const showWidget = (key: string) =>
    setDraft((prev) => prev.map((w) => (w.key === key ? { ...w, visible: true } : w)));

  const saveLayout = async () => {
    setSavingLayout(true);
    try {
      const res = await fetch('/api/v2/crm/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ widgets: draft }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWidgets(mergeDashboard(data.widgets));
      setEditing(false);
      toast({ title: 'Dashboard saved' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to save dashboard' });
    } finally {
      setSavingLayout(false);
    }
  };

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-destructive mb-4">{error}</p>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCw className="size-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dashboardInsights = buildDashboardInsights(
    overviewStats,
    dealStats,
    getPeriodLabel()
  );
  const insightGridClassName =
    dashboardInsights.length === 1
      ? 'grid-cols-1'
      : dashboardInsights.length === 2
        ? 'md:grid-cols-2'
        : 'lg:grid-cols-3';

  // ── Per-widget renderers (internals preserved from prior layout) ─────────
  const renderWidget = (key: string) => {
    switch (key) {
      case 'kpi-contacts':
        return (
          <StatsCard
            title="Contacts"
            value={overviewStats?.contacts ? formatNumber(overviewStats.contacts.total) : '0'}
            subtitle={overviewStats?.contacts ? `${overviewStats.contacts.thisMonth} ${getPeriodLabel().toLowerCase()}` : ''}
            icon={Users}
            trend={overviewStats?.contacts ? {
              value: overviewStats.contacts.change,
              type: overviewStats.contacts.changeType,
            } : undefined}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            onClick={() => push('/crm/contacts')}
            loading={loading}
          />
        );
      case 'kpi-companies':
        return (
          <StatsCard
            title="Companies"
            value={overviewStats?.companies ? formatNumber(overviewStats.companies.total) : '0'}
            subtitle={overviewStats?.companies ? `${overviewStats.companies.thisMonth} ${getPeriodLabel().toLowerCase()}` : ''}
            icon={Building2}
            trend={overviewStats?.companies ? {
              value: overviewStats.companies.change,
              type: overviewStats.companies.changeType,
            } : undefined}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            onClick={() => push('/crm/companies')}
            loading={loading}
          />
        );
      case 'kpi-deals-open':
        return (
          <StatsCard
            title="Active Deals"
            value={overviewStats?.activeDeals ? overviewStats.activeDeals.count.toString() : '0'}
            subtitle={overviewStats?.activeDeals ? formatCurrency(overviewStats.activeDeals.value) + ' in pipeline' : ''}
            icon={Target}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            onClick={() => push('/crm/deals')}
            loading={loading}
          />
        );
      case 'kpi-tasks-due':
        return (
          <StatsCard
            title="Tasks"
            value={overviewStats?.tasks ? overviewStats.tasks.total.toString() : '0'}
            subtitle={overviewStats?.tasks && overviewStats.tasks.overdue > 0 ? `${overviewStats.tasks.overdue} overdue` : 'All on track'}
            icon={CheckCircle2}
            iconColor={overviewStats?.tasks && overviewStats.tasks.overdue > 0 ? 'text-red-500' : 'text-primary'}
            iconBgColor={overviewStats?.tasks && overviewStats.tasks.overdue > 0 ? 'bg-red-500/10' : 'bg-primary/10'}
            onClick={() => push('/crm/activities')}
            loading={loading}
          />
        );
      case 'ai-insights':
        if (loading || dashboardInsights.length === 0) return null;
        return (
          <AiInsightsWidget
            insights={dashboardInsights}
            gridClassName={insightGridClassName}
            push={push}
            openAgent={openAgent}
            periodLabel={getPeriodLabel()}
          />
        );
      case 'pipeline-funnel':
        return (
          <DealFunnel
            pipelineName={dealStats?.byStage?.length ? 'Sales Pipeline' : undefined}
            stages={dealStats?.byStage?.map(stage => ({
              stageId: stage.stageId,
              stageName: stage.stageName,
              dealCount: stage.count,
              totalValue: stage.value,
              conversionRate: 0,
            })) || []}
            loading={loading}
            onStageClick={(stageId) => {
              push(`/crm/deals?stage=${stageId}`);
            }}
          />
        );
      case 'leaderboard':
        return (
          <Leaderboard
            entries={leaderboardData?.leaderboard || []}
            loading={loading}
            period={getPeriodLabel()}
          />
        );
      case 'activity-chart':
        return (
          <ActivityChart
            data={activityStats?.timeline || []}
            loading={loading}
          />
        );
      case 'activity-feed':
        return (
          <RecentActivityList
            activities={activityStats?.upcomingActivities || []}
            loading={loading}
          />
        );
      case 'summary':
        if (!overviewStats || loading) return null;
        return <SummaryWidget overviewStats={overviewStats} periodLabel={getPeriodLabel()} />;
      case 'forecast': {
        if (loading || !forecastData) return null;
        return <ForecastWidget forecastData={forecastData} push={push} />;
      }
      default:
        return null;
    }
  };

  const activeWidgets = editing ? orderedDraft : [...widgets].sort((a, b) => a.order - b.order);
  const visibleWidgets = activeWidgets.filter((w) => w.visible);
  const hiddenWidgets = orderedDraft.filter((w) => !w.visible);

  return (
    <div className="flex flex-col gap-3 overflow-x-clip">
      {/* Toolbar: period selector + dashboard edit controls */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            {hiddenWidgets.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 size-4" />
                    Add widget
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Hidden widgets</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hiddenWidgets.map((w) => (
                    <DropdownMenuItem key={w.key} onClick={() => showWidget(w.key)}>
                      {CRM_WIDGET_BY_KEY[w.key]?.label ?? w.key}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={savingLayout}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveLayout} disabled={savingLayout}>
              {savingLayout ? 'Saving…' : 'Save'}
            </Button>
          </>
        ) : (
          <>
            <Select
              value={period}
              onValueChange={(value) => setPeriod(value as typeof period)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="icon"
              disabled={refreshing}
            >
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={enterEdit}>
              <LayoutGrid className="mr-2 size-4" />
              Edit dashboard
            </Button>
          </>
        )}
      </div>

      {/* Composable widget grid (size → column span) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visibleWidgets.map((w, i) => {
          const def = CRM_WIDGET_BY_KEY[w.key];
          if (!def) return null;
          const body = renderWidget(w.key);
          if (!editing && !body) return null;
          return (
            <div key={w.key} className={cn('min-w-0', widgetColSpan(def.size))}>
              {editing && (
                <div className="mb-1.5 flex items-center justify-between rounded-md border border-dashed border-border bg-muted/40 px-2 py-1">
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {def.label}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => moveWidget(w.key, -1)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === visibleWidgets.length - 1}
                      onClick={() => moveWidget(w.key, 1)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Hide widget"
                      onClick={() => hideWidget(w.key)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
              <div className={cn(editing && !body && 'rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground')}>
                {body ?? (editing ? 'No data to preview' : null)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
