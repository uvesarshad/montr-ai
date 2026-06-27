'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Activity, BarChart3, Clock3, MessageSquareText, RefreshCcw, SmilePlus, Sparkles, Users } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button, Card, EmptyState, KpiRow, Select, Table } from '@/components/ui-kit';
import { conversationRoutes } from '@/lib/navigation/module-routes';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface AnalyticsAgentPerformance {
  totalConversations: number;
  resolvedConversations: number;
  avgResponseTime: number;
}

interface AnalyticsResponse {
  summary?: {
    totalConversations: number;
    openConversations: number;
    resolvedConversations: number;
    avgFirstResponseTime: number;
    avgResponseTime: number;
    avgCSAT: number;
  };
  volumeByChannel?: Record<string, number>;
  volumeByDay?: Record<string, number>;
  agentPerformance?: Record<string, AnalyticsAgentPerformance>;
}

const CHART_MUTED = 'hsl(var(--muted-foreground))';
const CHART_GRID = 'hsl(var(--border))';

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: CHART_MUTED,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: CHART_MUTED },
      grid: { color: CHART_GRID },
    },
    y: {
      ticks: { color: CHART_MUTED, precision: 0 },
      grid: { color: CHART_GRID },
      beginAtZero: true,
    },
  },
};

export default function AnalyticsPage() {
  const { push: routerPush } = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = new Date(
        Date.now() - parseInt(dateRange, 10) * 24 * 60 * 60 * 1000
      ).toISOString();
      const response = await fetch(`/api/v2/crm/inbox/analytics?startDate=${startDate}`);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const statCards = useMemo(() => {
    if (!analytics?.summary) {
      return [];
    }

    const resolvedRate = analytics.summary.totalConversations > 0
      ? Math.round((analytics.summary.resolvedConversations / analytics.summary.totalConversations) * 100)
      : 0;

    return [
      {
        label: 'Total conversations',
        value: analytics.summary.totalConversations,
        icon: MessageSquareText,
        pastel: 'violet' as const,
      },
      {
        label: 'Open queue',
        value: analytics.summary.openConversations,
        icon: Users,
        pastel: 'blue' as const,
      },
      {
        label: 'Resolved rate',
        value: `${resolvedRate}%`,
        icon: Activity,
        pastel: 'mint' as const,
      },
      {
        label: 'First response',
        value: `${analytics.summary.avgFirstResponseTime}m`,
        icon: Clock3,
        pastel: 'peach' as const,
      },
      {
        label: 'Average response',
        value: `${analytics.summary.avgResponseTime}m`,
        icon: Sparkles,
        pastel: 'lemon' as const,
      },
      {
        label: 'Average CSAT',
        value: analytics.summary.avgCSAT ? analytics.summary.avgCSAT.toFixed(1) : 'N/A',
        icon: SmilePlus,
        pastel: 'rose' as const,
      },
    ];
  }, [analytics]);

  const agentRows = useMemo(
    () =>
      Object.entries(analytics?.agentPerformance || {}).map(([agentId, data]) => {
        const resolutionRate = data.totalConversations > 0
          ? Math.round((data.resolvedConversations / data.totalConversations) * 100)
          : 0;
        return {
          agentId,
          agent: `Agent ${agentId.slice(-4)}`,
          total: data.totalConversations,
          resolved: data.resolvedConversations,
          resolutionRate: `${resolutionRate}%`,
          avgResponse: data.avgResponseTime ? `${Math.round(data.avgResponseTime / 60)}m` : 'N/A',
        };
      }),
    [analytics],
  );

  const volumeByDayData = useMemo(() => ({
    labels: Object.keys(analytics?.volumeByDay || {}).sort(),
    datasets: [
      {
        label: 'Conversations',
        data: Object.keys(analytics?.volumeByDay || {})
          .sort()
          .map((day) => analytics?.volumeByDay?.[day] || 0),
        borderColor: 'hsl(var(--brand))',
        backgroundColor: 'hsl(var(--brand) / 0.14)',
        tension: 0.35,
        fill: true,
      },
    ],
  }), [analytics]);

  const volumeByChannelData = useMemo(() => ({
    labels: Object.keys(analytics?.volumeByChannel || {}).map(
      (channel) => channel.charAt(0).toUpperCase() + channel.slice(1)
    ),
    datasets: [
      {
        data: Object.values(analytics?.volumeByChannel || {}),
        backgroundColor: [
          'rgba(122, 90, 248, 0.9)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(240, 120, 60, 0.85)',
          'rgba(236, 72, 153, 0.85)',
          'rgba(14, 165, 233, 0.85)',
        ],
        borderWidth: 0,
      },
    ],
  }), [analytics]);

  const filterBar = (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => routerPush(conversationRoutes.root)}>
        Back to conversations
      </Button>
      <Select
        value={dateRange}
        onChange={setDateRange}
        aria-label="Date range"
        triggerClassName="w-auto min-w-[140px]"
        options={[
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: 'Last 30 days' },
          { value: '90', label: 'Last 90 days' },
        ]}
      />
    </div>
  );

  const primaryAction = (
    <Button variant="outline" size="sm" icon={RefreshCcw} onClick={() => void fetchAnalytics()}>
      Refresh
    </Button>
  );

  return (
    <ModuleShell
      title="Analytics"
      icon={BarChart3}
      primaryAction={primaryAction}
      filterBar={filterBar}
      isLoading={loading}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {analytics?.summary ? (
        <>
          <KpiRow cols={3} items={statCards} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
            <Card title="Conversation volume" meta="Daily creation trend">
              <div className="h-[320px] px-4 pb-4">
                <Line data={volumeByDayData} options={{ ...chartOptions, plugins: { legend: { display: false } } }} />
              </div>
            </Card>

            <Card title="Channel mix" meta="Split across channels">
              <div className="h-[320px] px-4 pb-4">
                <Doughnut
                  data={volumeByChannelData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: { color: CHART_MUTED },
                      },
                    },
                    cutout: '68%',
                  }}
                />
              </div>
            </Card>
          </div>

          <Card title="Agent performance" meta="Resolution and response metrics">
            <Table
              rowKey="agentId"
              columns={[
                { key: 'agent', label: 'Agent' },
                { key: 'total', label: 'Total', align: 'right', mono: true },
                { key: 'resolved', label: 'Resolved', align: 'right', mono: true },
                { key: 'resolutionRate', label: 'Resolution rate', align: 'right', mono: true },
                { key: 'avgResponse', label: 'Avg response', align: 'right', mono: true },
              ]}
              rows={agentRows}
            />
          </Card>
        </>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="Analytics unavailable"
          note="Analytics data is unavailable right now. Try refreshing or widening the date range."
          className="min-h-[280px]"
        />
      )}
    </ModuleShell>
  );
}
