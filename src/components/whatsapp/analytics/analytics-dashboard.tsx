'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  CheckCheck,
  Eye,
  XCircle,
  Users,
  Activity,
} from 'lucide-react';

import {
  Card,
  KpiRow,
  Chip,
  Skeleton,
  EmptyState,
  Meter,
  AreaChart,
  Select,
  type KpiTileProps,
} from '@/components/ui-kit';

interface AnalyticsDashboardProps {
  accountId?: string;
}

interface Analytics {
  overview: {
    totalMessages: number;
    totalSent: number;
    totalDelivered: number;
    totalRead: number;
    totalFailed: number;
    deliveryRate: number;
    readRate: number;
    failureRate: number;
  };
  campaigns: {
    total: number;
    running: number;
    completed: number;
    paused: number;
  };
  contacts: {
    total: number;
    withPhone: number;
    groups: number;
  };
  trends: {
    messagesChange: number;
    deliveryChange: number;
    readChange: number;
  };
  recentActivity: unknown[];
}

export function AnalyticsDashboard({ accountId }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const url = accountId
        ? `/api/whatsapp/analytics?accountId=${accountId}&range=${timeRange}`
        : `/api/whatsapp/analytics?range=${timeRange}`;

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setAnalytics(data.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [accountId, timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const rangeSelect = (
    <Select
      value={timeRange}
      onChange={setTimeRange}
      triggerClassName="w-[140px]"
      options={[
        { value: '24h', label: 'Last 24h' },
        { value: '7d', label: 'Last 7 days' },
        { value: '30d', label: 'Last 30 days' },
        { value: '90d', label: 'Last 90 days' },
      ]}
    />
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <KpiRow
          items={Array.from({ length: 4 }).map(() => ({
            value: <Skeleton className="h-7 w-20" />,
            label: <Skeleton className="h-3 w-24" />,
          }))}
        />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <EmptyState
          icon={Activity}
          title="No analytics data available"
          note="Send messages and campaigns to start tracking performance here."
        />
      </Card>
    );
  }

  const o = analytics.overview;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const kpis: KpiTileProps[] = [
    {
      icon: MessageSquare,
      iconTone: 'info',
      label: 'Total messages',
      value: o.totalMessages.toLocaleString(),
      delta:
        analytics.trends.messagesChange !== 0
          ? `${Math.abs(analytics.trends.messagesChange)}%`
          : undefined,
      up: analytics.trends.messagesChange >= 0,
    },
    {
      icon: Send,
      iconTone: 'brand',
      label: 'Sent',
      value: o.totalSent.toLocaleString(),
    },
    {
      icon: CheckCheck,
      iconTone: 'ok',
      label: 'Delivered',
      value: o.totalDelivered.toLocaleString(),
      delta: pct(o.deliveryRate),
      up: analytics.trends.deliveryChange >= 0,
    },
    {
      icon: Eye,
      iconTone: 'brand',
      label: 'Read',
      value: o.totalRead.toLocaleString(),
      delta: pct(o.readRate),
      up: analytics.trends.readChange >= 0,
    },
  ];

  const readOfDelivered =
    o.totalDelivered > 0 ? (o.totalRead / o.totalDelivered) * 100 : 0;
  const readOfTotal =
    o.totalMessages > 0 ? (o.totalRead / o.totalMessages) * 100 : 0;

  // Synthetic engagement series (real time-series lives in AnalyticsCharts).
  const series = [
    {
      name: 'Delivery',
      color: 'hsl(var(--success))',
      data: [o.deliveryRate * 0.9, o.deliveryRate * 0.95, o.deliveryRate],
    },
    {
      name: 'Read',
      color: 'hsl(var(--brand))',
      data: [o.readRate * 0.85, o.readRate * 0.93, o.readRate],
    },
  ];

  const funnel: Array<{ label: string; value: number; tone: 'info' | 'brand' | 'ok' | 'danger' }> = [
    { label: 'Read rate of delivered', value: readOfDelivered, tone: 'info' },
    { label: 'Overall delivery rate', value: o.deliveryRate, tone: 'ok' },
    { label: 'Overall read rate', value: readOfTotal, tone: 'brand' },
    { label: 'Failure rate', value: o.failureRate, tone: 'danger' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Range selector */}
      <div className="flex items-center justify-end">{rangeSelect}</div>

      {/* Overview KPIs */}
      <KpiRow items={kpis} />

      {/* Secondary stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card icon={XCircle} title="Failed messages">
          <div className="px-4 pb-4">
            <div className="text-2xl font-semibold tabular-nums">{o.totalFailed.toLocaleString()}</div>
            <p className="mt-1 text-xs text-danger">{pct(o.failureRate)} failure rate</p>
          </div>
        </Card>

        <Card icon={Send} title="Campaigns">
          <div className="px-4 pb-4">
            <div className="text-2xl font-semibold tabular-nums">{analytics.campaigns.total}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone="info" dot>{analytics.campaigns.running} running</Chip>
              <Chip tone="ok">{analytics.campaigns.completed} completed</Chip>
            </div>
          </div>
        </Card>

        <Card icon={Users} title="Contacts">
          <div className="px-4 pb-4">
            <div className="text-2xl font-semibold tabular-nums">{analytics.contacts.total.toLocaleString()}</div>
            <p className="mt-1 text-xs text-muted-foreground">{analytics.contacts.groups} groups</p>
          </div>
        </Card>
      </div>

      {/* Engagement chart */}
      <Card
        icon={Activity}
        title="Performance overview"
        meta="message delivery & engagement"
        footer={
          <>
            <span className="flex items-center gap-4">
              {series.map((s) => (
                <span key={s.name} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[3px]" style={{ background: s.color }} />
                  <span className="font-medium">{s.name}</span>
                </span>
              ))}
            </span>
            <span className="font-mono">{pct(o.readRate)} read</span>
          </>
        }
      >
        <div className="min-h-[200px] px-3 pt-2">
          <AreaChart series={series} />
        </div>
      </Card>

      {/* Engagement breakdown */}
      <Card title="Engagement metrics" meta="interaction breakdown">
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {funnel.map((f) => (
            <div key={f.label}>
              <div className="text-2xl font-semibold tabular-nums">{pct(f.value)}</div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{f.label}</p>
              <Meter className="mt-2" value={f.value} tone={f.tone} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
