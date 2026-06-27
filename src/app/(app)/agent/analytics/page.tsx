'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart2, CheckCircle2, Clock, Zap, Bot, RefreshCw } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
  Button,
  Card,
  Chip,
  KpiRow,
  Meter,
  Skeleton,
  PageHeader,
  Select,
  type ChipTone,
  type KpiTileProps,
} from '@/components/ui-kit';

interface AnalyticsData {
  period: { days: number; since: string };
  total: number;
  byStatus: Record<string, number>;
  successRate: number | null;
  avgDurationMin: number | null;
  totalTokens: number;
  totalToolCalls: number;
  topAgents: { agent: string; count: number }[];
}

const STATUS_TONES: Record<string, ChipTone> = {
  active:    'ok',
  waiting:   'warn',
  completed: 'info',
  blocked:   'danger',
  draft:     'gray',
  scheduled: 'purple',
};

const DAY_OPTIONS = [7, 14, 30, 90];

export default function AgentAnalyticsPage() {
  const { currentBrandId } = useCurrentBrand();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(d) });
      if (currentBrandId) params.set('brandId', currentBrandId);
      const res = await fetch(`/api/v2/agent/analytics?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [currentBrandId]);

  useEffect(() => { fetch_(days); }, [fetch_, days]);

  const kpiItems: KpiTileProps[] = data
    ? [
        { icon: Bot, label: 'Total missions', value: data.total, pastel: 'violet' },
        {
          icon: CheckCircle2,
          label: 'Success rate',
          value: data.successRate !== null ? `${data.successRate}%` : '—',
          pastel: 'mint',
        },
        {
          icon: Clock,
          label: 'Avg duration',
          value: data.avgDurationMin !== null ? `${data.avgDurationMin}m` : '—',
          pastel: 'blue',
        },
        {
          icon: Zap,
          label: 'Tool calls',
          value: data.totalToolCalls.toLocaleString(),
          pastel: 'peach',
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        icon={BarChart2}
        title="Agent Analytics"
        actions={
          <>
            <Select
              value={String(days)}
              onChange={v => setDays(Number(v))}
              options={DAY_OPTIONS.map(d => ({ value: String(d), label: `Last ${d}d` }))}
              triggerClassName="w-28"
            />
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => fetch_(days)}>
              Refresh
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data ? (
        <>
          <KpiRow items={kpiItems} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Status breakdown */}
            <Card icon={BarChart2} title="Missions by status">
              <div className="space-y-2 px-4 pb-4">
                {Object.entries(data.byStatus).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No missions in this period.</p>
                ) : (
                  Object.entries(data.byStatus)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between gap-2">
                        <Chip tone={STATUS_TONES[status] ?? 'gray'} className="h-[19px] text-[11px] capitalize">
                          {status}
                        </Chip>
                        <Meter
                          value={Math.round((count / data.total) * 100)}
                          tone="brand"
                          className="mx-3 flex-1"
                        />
                        <span className="w-8 text-right text-sm font-medium tabular-nums">{count}</span>
                      </div>
                    ))
                )}
              </div>
            </Card>

            {/* Top agents */}
            <Card icon={Bot} title="Top agents">
              <div className="space-y-2 px-4 pb-4">
                {data.topAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  data.topAgents.map(({ agent, count }) => (
                    <div key={agent} className="flex items-center justify-between gap-2">
                      <span className="text-sm capitalize">{agent.replace(/-/g, ' ')}</span>
                      <Meter
                        value={Math.round((count / data.topAgents[0].count) * 100)}
                        tone="brand"
                        className="mx-3 flex-1"
                      />
                      <span className="w-8 text-right text-sm font-medium tabular-nums">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Failed to load analytics.</p>
      )}
    </div>
  );
}
