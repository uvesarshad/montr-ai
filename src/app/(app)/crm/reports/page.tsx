'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import {
  PageHeader,
  Toolbar,
  Segmented,
  Select,
  Card,
  KpiTile,
  Table,
  Banner,
  Meter,
  EmptyState,
  Spinner,
  type TableColumn,
} from '@/components/ui-kit';
import { BarChart3, TrendingUp, AlertTriangle, Filter } from 'lucide-react';

/* ───────────────────────────── types ──────────────────────────── */

interface ForecastOwnerRow { ownerId: string | null; weighted: number; bestCase: number; committed: number; }
interface ForecastPeriod {
  period: string;
  periodEnd: string;
  committed: number;
  weighted: number;
  bestCase: number;
  counts: { committed: number; open: number };
  byOwner: ForecastOwnerRow[];
}
interface ForecastResponse {
  period: 'month' | 'quarter';
  horizon: number;
  periods: ForecastPeriod[];
  overdue: { count: number; value: number };
}
interface StageRow extends Record<string, unknown> {
  stageId: string;
  stageName: string;
  type: string;
  order: number;
  entered: number;
  advanced: number;
  conversionRate: number;
  avgDurationDays: number | null;
}
interface ConversionResponse { method: string; pipelineName: string; stages: StageRow[]; }
interface PipelineLite { _id: string; name: string; isDefault?: boolean; }

/* ───────────────────────────── helpers ─────────────────────────── */

function money(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function periodLabel(iso: string, period: 'month' | 'quarter'): string {
  const d = new Date(iso);
  if (period === 'quarter') {
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/* ───────────────────────────── reports data state ─────────────── */

interface ReportsDataState {
  forecast: ForecastResponse | null;
  conversion: ConversionResponse | null;
  loading: boolean;
  error: string | null;
}

type ReportsDataAction =
  | { type: 'load' }
  | { type: 'success'; forecast: ForecastResponse; conversion: ConversionResponse | null }
  | { type: 'error'; error: string };

const initialReportsDataState: ReportsDataState = {
  forecast: null,
  conversion: null,
  loading: true,
  error: null,
};

function reportsDataReducer(state: ReportsDataState, action: ReportsDataAction): ReportsDataState {
  switch (action.type) {
    case 'load':
      return { ...state, loading: true, error: null };
    case 'success':
      return { forecast: action.forecast, conversion: action.conversion, loading: false, error: null };
    case 'error':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

/* ───────────────────────────── page ───────────────────────────── */

export default function CrmReportsPage() {
  const [pipelines, setPipelines] = useState<PipelineLite[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [period, setPeriod] = useState<'month' | 'quarter'>('month');
  const [ownerId, setOwnerId] = useState<string>('');
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);

  const [{ forecast, conversion, loading, error }, dispatchData] = useReducer(
    reportsDataReducer,
    initialReportsDataState,
  );

  // Load pipelines + owner names once.
  useEffect(() => {
    (async () => {
      try {
        const [plRes, lbRes] = await Promise.all([
          fetch('/api/v2/crm/pipelines', { credentials: 'include' }),
          fetch('/api/v2/crm/stats/leaderboard?period=year', { credentials: 'include' }),
        ]);
        if (plRes.ok) {
          const json = await plRes.json();
          const list: PipelineLite[] = (json.data || []).map((p: { _id: string; name: string; isDefault?: boolean }) => ({
            _id: p._id, name: p.name, isDefault: p.isDefault,
          }));
          setPipelines(list);
          const def = list.find((p) => p.isDefault) || list[0];
          if (def) setPipelineId(def._id);
        }
        if (lbRes.ok) {
          const json = await lbRes.json();
          setOwners((json.leaderboard || []).map((e: { userId: string; userName: string }) => ({
            id: e.userId, name: e.userName,
          })));
        }
      } catch {
        /* non-fatal — controls just stay empty */
      }
    })();
  }, []);

  const fetchReports = useCallback(async () => {
    dispatchData({ type: 'load' });
    try {
      const fq = new URLSearchParams({ period, horizon: '4' });
      if (pipelineId) fq.set('pipelineId', pipelineId);
      if (ownerId) fq.set('ownerId', ownerId);
      const cq = new URLSearchParams();
      if (pipelineId) cq.set('pipelineId', pipelineId);

      const [fRes, cRes] = await Promise.all([
        fetch(`/api/v2/crm/stats/forecast?${fq.toString()}`, { credentials: 'include' }),
        fetch(`/api/v2/crm/stats/stage-conversion?${cq.toString()}`, { credentials: 'include' }),
      ]);
      if (!fRes.ok) throw new Error('Failed to load forecast');
      dispatchData({
        type: 'success',
        forecast: await fRes.json(),
        conversion: cRes.ok ? await cRes.json() : null,
      });
    } catch (e) {
      dispatchData({ type: 'error', error: e instanceof Error ? e.message : 'Failed to load reports' });
    }
  }, [period, pipelineId, ownerId]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const ownerName = useCallback(
    (id: string | null) => (id ? owners.find((o) => o.id === id)?.name || 'Unknown' : 'Unassigned'),
    [owners],
  );

  /* ── forecast: per-period table rows ── */
  const forecastRows = useMemo(() => {
    if (!forecast) return [];
    return forecast.periods.map((p) => ({
      id: p.period,
      label: periodLabel(p.period, forecast.period),
      committed: p.committed,
      weighted: p.weighted,
      bestCase: p.bestCase,
      open: p.counts.open,
    }));
  }, [forecast]);

  const forecastCols: TableColumn<(typeof forecastRows)[number]>[] = [
    { key: 'label', label: 'Period' },
    { key: 'committed', label: 'Committed (Won)', align: 'right', mono: true, render: (v) => money(v as number) },
    { key: 'weighted', label: 'Weighted', align: 'right', mono: true, render: (v) => money(v as number) },
    { key: 'bestCase', label: 'Best case', align: 'right', mono: true, render: (v) => money(v as number) },
    { key: 'open', label: 'Open deals', align: 'right', mono: true },
  ];

  /* ── by-owner table for current horizon (aggregated across periods) ── */
  const ownerRows = useMemo(() => {
    if (!forecast) return [];
    const map = new Map<string, { ownerId: string | null; weighted: number; bestCase: number; committed: number }>();
    for (const p of forecast.periods) {
      for (const o of p.byOwner) {
        const k = o.ownerId ?? 'unassigned';
        const cur = map.get(k) || { ownerId: o.ownerId, weighted: 0, bestCase: 0, committed: 0 };
        cur.weighted += o.weighted;
        cur.bestCase += o.bestCase;
        cur.committed += o.committed;
        map.set(k, cur);
      }
    }
    return Array.from(map.values())
      .map((o) => ({ id: o.ownerId ?? 'unassigned', name: ownerName(o.ownerId), ...o }))
      .sort((a, b) => b.weighted - a.weighted);
  }, [forecast, ownerName]);

  const ownerCols: TableColumn<(typeof ownerRows)[number]>[] = [
    { key: 'name', label: 'Owner' },
    { key: 'committed', label: 'Committed', align: 'right', mono: true, render: (v) => money(v as number) },
    { key: 'weighted', label: 'Weighted', align: 'right', mono: true, render: (v) => money(v as number) },
    { key: 'bestCase', label: 'Best case', align: 'right', mono: true, render: (v) => money(v as number) },
  ];

  /* ── stage conversion table ── */
  const stageCols: TableColumn<StageRow>[] = [
    { key: 'stageName', label: 'Stage' },
    { key: 'entered', label: 'Entered', align: 'right', mono: true },
    { key: 'advanced', label: 'Advanced', align: 'right', mono: true },
    {
      key: 'conversionRate',
      label: 'Conversion',
      render: (v) => {
        const pct = Math.round((v as number) * 100);
        return (
          <div className="flex items-center gap-2">
            <Meter value={pct} className="w-20" />
            <span className="tabular-nums text-[12.5px]">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: 'avgDurationDays',
      label: 'Avg days',
      align: 'right',
      mono: true,
      render: (v) => (v === null ? '—' : `${v}d`),
    },
  ];

  const current = forecast?.periods[0];
  const pipelineOptions = pipelines.map((p) => ({ value: p._id, label: p.name }));
  const ownerOptions = [{ value: '', label: 'All owners' }, ...owners.map((o) => ({ value: o.id, label: o.name }))];

  return (
    <ModuleShell title="Reports">
      <div className="flex flex-col gap-4 p-4">
        <PageHeader
          title="Reports"
          sub="Sales forecast and stage-by-stage conversion for your pipeline."
          icon={BarChart3}
        />

        <Toolbar>
          {pipelineOptions.length > 0 ? (
            <Select
              options={pipelineOptions}
              value={pipelineId}
              onChange={setPipelineId}
              aria-label="Pipeline"
              triggerClassName="w-[200px]"
            />
          ) : null}
          <Segmented
            options={[
              { value: 'month', label: 'Monthly' },
              { value: 'quarter', label: 'Quarterly' },
            ]}
            value={period}
            onChange={(v) => setPeriod(v as 'month' | 'quarter')}
          />
          <Select
            options={ownerOptions}
            value={ownerId}
            onChange={setOwnerId}
            placeholder="All owners"
            aria-label="Owner"
            triggerClassName="w-[180px]"
          />
        </Toolbar>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Spinner /> Loading reports…
          </div>
        ) : error ? (
          <EmptyState icon={AlertTriangle} title="Couldn’t load reports" note={error} />
        ) : (
          <>
            {forecast && forecast.overdue.count > 0 ? (
              <Banner tone="warn" icon={AlertTriangle} title="Deals past their expected close date">
                {forecast.overdue.count} open deal{forecast.overdue.count === 1 ? '' : 's'} worth{' '}
                {money(forecast.overdue.value)} are overdue and at risk of slipping.
              </Banner>
            ) : null}

            {/* Current-period KPI tiles */}
            {current ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiTile
                  icon={TrendingUp}
                  label={`Committed · ${periodLabel(current.period, forecast!.period)}`}
                  value={money(current.committed)}
                  sub={`${current.counts.committed} won`}
                  pastel="mint"
                />
                <KpiTile
                  icon={Filter}
                  label="Weighted forecast"
                  value={money(current.weighted)}
                  sub={`${current.counts.open} open deals`}
                  pastel="violet"
                />
                <KpiTile
                  icon={BarChart3}
                  label="Best case"
                  value={money(current.bestCase)}
                  sub="all open in period"
                  pastel="blue"
                />
              </div>
            ) : null}

            {/* Forecast by period */}
            <Card icon={TrendingUp} title="Forecast by period">
              {forecastRows.length ? (
                <Table columns={forecastCols} rows={forecastRows} rowKey="id" />
              ) : (
                <EmptyState icon={TrendingUp} title="No forecast data" note="No deals fall in the selected horizon." />
              )}
            </Card>

            {/* By owner */}
            <Card icon={Filter} title="Forecast by owner" meta={`next ${forecast?.horizon ?? 4} periods`}>
              {ownerRows.length ? (
                <Table columns={ownerCols} rows={ownerRows} rowKey="id" />
              ) : (
                <EmptyState icon={Filter} title="No owner data" note="No owned deals in the selected horizon." />
              )}
            </Card>

            {/* Stage conversion */}
            <Card
              icon={BarChart3}
              title="Stage conversion"
              meta={conversion?.pipelineName}
            >
              {conversion && conversion.stages.length ? (
                <Table columns={stageCols} rows={conversion.stages} rowKey="stageId" />
              ) : (
                <EmptyState icon={BarChart3} title="No conversion data" note="Stage history is needed to compute conversion." />
              )}
            </Card>
          </>
        )}
      </div>
    </ModuleShell>
  );
}
