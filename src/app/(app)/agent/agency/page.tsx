'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, RefreshCw, Zap, Bot, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import {
  Button,
  Card,
  Chip,
  Avatar,
  KpiRow,
  Skeleton,
  EmptyState,
  PageHeader,
  type KpiTileProps,
} from '@/components/ui-kit';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import { cn } from '@/lib/utils';

interface BrandAgencyRow {
  brandId: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  total: number;
  active: number;
  waiting: number;
  completed: number;
  blocked: number;
  successRate: number | null;
  totalTokens: number;
  totalToolCalls: number;
  lastActivityAt: string | null;
}

interface AgencyData {
  brands: BrandAgencyRow[];
  isSingleBrand: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgencyDashboardPage() {
  const { push } = useRouter();
  const { setCurrentBrandId } = useCurrentBrand();
  const [data, setData] = useState<AgencyData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/agent/agency');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function drillDown(brandId: string) {
    setCurrentBrandId(brandId);
    push('/agent');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (data?.isSingleBrand) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState
          icon={Building2}
          title="Agency dashboard requires multiple brands"
          note="Create at least two brands in your organization to use the agency overview."
          cta={
            <Button variant="outline" size="sm" onClick={() => push('/agent')}>
              Go to Agent
            </Button>
          }
        />
      </div>
    );
  }

  const brands = data?.brands ?? [];
  const totalActive = brands.reduce((s, b) => s + b.active, 0);
  const totalWaiting = brands.reduce((s, b) => s + b.waiting, 0);
  const totalMissions = brands.reduce((s, b) => s + b.total, 0);

  const summaryItems: KpiTileProps[] = [
    { icon: Bot, label: 'Total missions', value: totalMissions, pastel: 'violet' },
    { icon: Zap, label: 'Active now', value: totalActive, pastel: 'mint' },
    { icon: Clock, label: 'Awaiting approval', value: totalWaiting, pastel: 'peach' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        icon={Building2}
        title="Agency Overview"
        sub={`${brands.length} brands`}
        actions={
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchData}>
            Refresh
          </Button>
        }
      />

      {/* Summary strip */}
      <KpiRow items={summaryItems} cols={3} />

      {/* Per-brand cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {brands.map((brand) => (
          <Card
            key={brand.brandId}
            lift
            className="cursor-pointer"
            bodyClassName="flex flex-col"
          >
            <button
              type="button"
              onClick={() => drillDown(brand.brandId)}
              className="flex flex-col gap-3 px-4 py-4 text-left"
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={brand.name} src={brand.avatarUrl ?? undefined} size={32} square />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{brand.name}</div>
                  {brand.handle && (
                    <p className="truncate text-xs text-muted-foreground">@{brand.handle}</p>
                  )}
                </div>
                {brand.active > 0 && (
                  <Chip tone="ok" dot className="h-[19px] text-[11px]">{brand.active} live</Chip>
                )}
              </div>

              {/* Status mini-row */}
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{brand.total} missions</span>
                {brand.waiting > 0 && (
                  <span className="flex items-center gap-0.5 text-warning-foreground">
                    <Clock className="size-3" />
                    {brand.waiting} pending
                  </span>
                )}
                {brand.blocked > 0 && (
                  <span className="flex items-center gap-0.5 text-danger">
                    <AlertCircle className="size-3" />
                    {brand.blocked} blocked
                  </span>
                )}
              </div>

              {/* KPI mini-grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Success rate</span>
                  <p className={cn('font-medium', brand.successRate !== null && brand.successRate >= 80 && 'text-success')}>
                    {brand.successRate !== null ? `${brand.successRate}%` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tool calls</span>
                  <p className="font-medium">{brand.totalToolCalls.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed</span>
                  <p className="flex items-center gap-0.5 font-medium">
                    <CheckCircle2 className="size-3 text-success" />
                    {brand.completed}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last activity</span>
                  <p className="font-medium">{formatRelative(brand.lastActivityAt)}</p>
                </div>
              </div>

              <p className="text-xs font-medium text-brand-strong">View missions →</p>
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
