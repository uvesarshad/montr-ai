'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DollarSign, Eye, Megaphone, MousePointerClick, RefreshCw, Target } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    AreaChart,
    Button,
    Card,
    Chip,
    DataTable,
    KpiRow,
    PageHeader,
    Select,
    Skeleton,
    type DataTableColumn,
    type KpiTileProps,
} from '@/components/ui-kit';
import {
    BreakdownEntity,
    PLATFORM_LABELS,
    TimeseriesPoint,
    fmtMoney,
    fmtNum,
    fmtPct,
    rangeForDays,
    type AdsPlatform,
} from './ads-data';

const DAY_OPTIONS = [7, 30, 90];

interface DetailProps {
    platform: AdsPlatform;
    entityId: string;
    /** Display name passed from the list (falls back to the id) */
    name?: string;
}

interface SubEntityRow {
    id: string;
    name: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
}

function toRow(entity: BreakdownEntity): SubEntityRow {
    const spend = entity.metrics.spend || 0;
    const impressions = entity.metrics.impressions || 0;
    const clicks = entity.metrics.clicks || 0;
    return {
        id: entity.entityId,
        name: entity.entityName || entity.entityId,
        spend,
        impressions,
        clicks,
        conversions: entity.metrics.conversions || 0,
        ctr: impressions > 0 ? clicks / impressions : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
    };
}

export function AdsCampaignDetail({ platform, entityId, name }: DetailProps) {
    const { currentBrandId } = useCurrentBrand();
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [series, setSeries] = useState<TimeseriesPoint[]>([]);
    const [adsets, setAdsets] = useState<SubEntityRow[]>([]);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            const { dateFrom, dateTo } = rangeForDays(d);
            const base = new URLSearchParams({ sourceType: platform, dateFrom, dateTo });
            if (currentBrandId) base.set('brandId', currentBrandId);

            const seriesParams = new URLSearchParams(base);
            seriesParams.set('entityType', 'campaign');
            seriesParams.set('entityId', entityId);

            const adsetParams = new URLSearchParams(base);
            adsetParams.set('entityType', 'adset');
            adsetParams.set('parentEntityId', entityId);

            const [seriesRes, adsetRes] = await Promise.all([
                fetch(`/api/v2/analytics/timeseries?${seriesParams}`),
                fetch(`/api/v2/analytics/breakdown?${adsetParams}`),
            ]);

            setSeries(seriesRes.ok ? (await seriesRes.json()).series || [] : []);
            setAdsets(adsetRes.ok ? ((await adsetRes.json()).entities || []).map(toRow).sort((a: SubEntityRow, b: SubEntityRow) => b.spend - a.spend) : []);
        } finally {
            setLoading(false);
        }
    }, [platform, entityId, currentBrandId]);

    useEffect(() => { load(days); }, [load, days]);

    const totals = useMemo(() => {
        const sum = (metric: string) => series.reduce((acc, point) => acc + (point.metrics[metric] || 0), 0);
        return {
            spend: sum('spend'),
            impressions: sum('impressions'),
            clicks: sum('clicks'),
            conversions: sum('conversions'),
        };
    }, [series]);

    const kpiItems: KpiTileProps[] = [
        { icon: DollarSign, label: 'Spend', value: fmtMoney(totals.spend), pastel: 'violet' },
        { icon: Eye, label: 'Impressions', value: fmtNum(totals.impressions), pastel: 'blue' },
        { icon: MousePointerClick, label: 'Clicks', value: fmtNum(totals.clicks), sub: totals.impressions > 0 ? `CTR ${fmtPct(totals.clicks / totals.impressions)}` : undefined, pastel: 'mint' },
        { icon: Target, label: 'Conversions', value: fmtNum(totals.conversions), pastel: 'peach' },
    ];

    const chart = useMemo(() => {
        if (series.length < 2) return null;
        const tickEvery = Math.max(1, Math.floor(series.length / 6));
        return {
            series: [{
                name: 'Spend',
                color: platform === 'meta_ads' ? '#3b82f6' : '#7c5cff',
                data: series.map((point) => point.metrics.spend || 0),
            }],
            labels: series
                .map((point, index) => ({ x: index, t: point.date.slice(5) }))
                .filter((_, index) => index % tickEvery === 0),
        };
    }, [series, platform]);

    const columns: DataTableColumn<SubEntityRow>[] = useMemo(() => [
        {
            accessorKey: 'name',
            header: platform === 'meta_ads' ? 'Ad set' : 'Ad group',
            cell: ({ row }) => <span className="block max-w-[260px] truncate font-medium">{row.original.name}</span>,
        },
        { accessorKey: 'spend', header: 'Spend', cell: ({ row }) => <span className="tabular-nums">{fmtMoney(row.original.spend)}</span> },
        { accessorKey: 'impressions', header: 'Impressions', cell: ({ row }) => <span className="tabular-nums">{fmtNum(row.original.impressions)}</span> },
        { accessorKey: 'clicks', header: 'Clicks', cell: ({ row }) => <span className="tabular-nums">{fmtNum(row.original.clicks)}</span> },
        { accessorKey: 'ctr', header: 'CTR', cell: ({ row }) => <span className="tabular-nums">{fmtPct(row.original.ctr)}</span> },
        { accessorKey: 'cpc', header: 'CPC', cell: ({ row }) => <span className="tabular-nums">{fmtMoney(row.original.cpc)}</span> },
        { accessorKey: 'conversions', header: 'Conv.', cell: ({ row }) => <span className="tabular-nums">{fmtNum(row.original.conversions)}</span> },
    ], [platform]);

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                icon={Megaphone}
                title={
                    <span className="flex items-center gap-2">
                        <span className="truncate">{name || entityId}</span>
                        <Chip tone={platform === 'meta_ads' ? 'info' : 'purple'}>{PLATFORM_LABELS[platform]}</Chip>
                    </span>
                }
                sub={`Campaign ${entityId}`}
                actions={
                    <>
                        <Select
                            value={String(days)}
                            onChange={(value) => setDays(Number(value))}
                            options={DAY_OPTIONS.map((d) => ({ value: String(d), label: `Last ${d}d` }))}
                            triggerClassName="w-28"
                        />
                        <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => load(days)}>
                            Refresh
                        </Button>
                        <Button variant="ghost" size="sm" icon={ArrowLeft} asChild>
                            <Link href="/ads/campaigns">All campaigns</Link>
                        </Button>
                    </>
                }
            />

            {loading ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
                    </div>
                    <Skeleton className="h-56" />
                </div>
            ) : (
                <>
                    <KpiRow items={kpiItems} cols={4} />

                    {chart && (
                        <Card title="Daily spend" icon={DollarSign}>
                            <div className="h-48">
                                <AreaChart series={chart.series} labels={chart.labels} />
                            </div>
                        </Card>
                    )}

                    <DataTable
                        columns={columns}
                        data={adsets}
                        getRowId={(row) => row.id}
                        emptyTitle={platform === 'meta_ads' ? 'No ad set data' : 'No ad group data'}
                        emptyNote="Breakdown rows appear after the next insights sync."
                        mobileCard={(row) => (
                            <div className="space-y-1 rounded-lg border border-border bg-card p-3">
                                <span className="block truncate text-sm font-medium">{row.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {fmtMoney(row.spend)} · {fmtNum(row.clicks)} clicks · {fmtNum(row.conversions)} conv
                                </span>
                            </div>
                        )}
                    />
                </>
            )}
        </div>
    );
}
