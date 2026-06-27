'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
  BarChart3,
  Mail,
  MousePointerClick,
  Activity,
  TrendingUp,
  Send,
} from 'lucide-react';

import {
  Button,
  KpiRow,
  Card,
  AreaChart,
  Chip,
  EmptyState,
  type ChipTone,
} from '@/components/ui-kit';
import { ModuleShell } from '@/components/shell/module-shell';

type RecentCampaign = {
  _id: string;
  name: string;
  status: string;
  createdAt: string;
  stats?: {
    sent?: number;
    opened?: number;
    clicked?: number;
  };
};

type MarketingStats = {
  totalSent?: number;
  totalOpened?: number;
  totalClicked?: number;
  recentCampaigns?: RecentCampaign[];
};

const STATUS_TONE: Record<string, ChipTone> = {
  completed: 'ok',
  sent: 'ok',
  sending: 'brand',
  scheduled: 'info',
  paused: 'warn',
  failed: 'danger',
  draft: 'gray',
};

function statusTone(status: string): ChipTone {
  return STATUS_TONE[status.toLowerCase()] ?? 'gray';
}

export default function MarketingDashboardPage() {
  const router = useRouter();
  const { data: stats, isLoading, error } = useQuery<MarketingStats>({
    queryKey: ['marketing-stats'],
    queryFn: async () => {
      const response = await fetch('/api/v2/marketing-email/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  const summary = useMemo(() => {
    const totalSent = stats?.totalSent || 0;
    const totalOpened = stats?.totalOpened || 0;
    const totalClicked = stats?.totalClicked || 0;
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
    const clickRate = totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0;
    const active = stats?.recentCampaigns?.length || 0;

    return {
      totalSent,
      totalOpened,
      totalClicked,
      openRate,
      clickRate,
      active,
    };
  }, [stats]);

  const funnelSeries = useMemo(
    () => [
      {
        name: 'Opens',
        color: 'hsl(var(--brand))',
        data: [summary.totalSent, summary.totalOpened, summary.totalClicked].map((v) => v || 0),
      },
    ],
    [summary],
  );

  return (
    <ModuleShell
      title="Dashboard"
      icon={BarChart3}
      primaryAction={
        <Button variant="brand" icon={Plus} onClick={() => router.push('/marketing/email/campaigns/new')}>
          New campaign
        </Button>
      }
      isLoading={isLoading}
      error={error ? { title: 'Failed to load', message: 'Failed to load email dashboard.' } : null}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <KpiRow
        items={[
          {
            icon: Mail,
            label: 'Total sent',
            value: summary.totalSent.toLocaleString(),
            pastel: 'violet',
          },
          {
            icon: BarChart3,
            label: 'Open rate',
            value: `${summary.openRate}%`,
            pastel: 'mint',
          },
          {
            icon: MousePointerClick,
            label: 'Click rate',
            value: `${summary.clickRate}%`,
            pastel: 'blue',
          },
          {
            icon: Activity,
            label: 'Recent activity',
            value: summary.active,
            pastel: 'peach',
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card
          spotlight
          icon={TrendingUp}
          title="Engagement funnel"
          meta="sent → opened → clicked"
          bodyClassName="px-4 pb-4"
          footer={
            <span className="font-mono">
              {summary.openRate}% open · {summary.clickRate}% click
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-3 pt-3">
            <FunnelStat label="Sent" value={summary.totalSent} />
            <FunnelStat label="Opened" value={summary.totalOpened} />
            <FunnelStat label="Clicked" value={summary.totalClicked} />
          </div>
          <div className="mt-3 h-[140px]">
            <AreaChart
              series={funnelSeries}
              labels={[
                { x: 0, t: 'Sent' },
                { x: 0.5, t: 'Opened' },
                { x: 1, t: 'Clicked' },
              ]}
            />
          </div>
        </Card>

        <Card icon={Send} title="Recent campaigns" bodyClassName="p-3">
          {stats?.recentCampaigns?.length ? (
            <div className="flex flex-col gap-2">
              {stats.recentCampaigns.map((campaign) => (
                <div
                  key={campaign._id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-[13.5px] font-semibold">{campaign.name}</p>
                    <div className="flex items-center gap-2">
                      <Chip tone={statusTone(campaign.status)} dot className="capitalize">
                        {campaign.status}
                      </Chip>
                      <span className="text-[12px] text-muted-foreground">
                        {new Date(campaign.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums">
                    {(campaign.stats?.sent || 0).toLocaleString()} sent
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Mail}
              title="No campaigns yet"
              note="Create the first email campaign to start filling this dashboard with delivery and engagement data."
              cta={
                <Button variant="brand" icon={Plus} onClick={() => router.push('/marketing/email/campaigns/new')}>
                  Create campaign
                </Button>
              }
            />
          )}
        </Card>
      </div>
    </ModuleShell>
  );
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-mono text-[22px] font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
