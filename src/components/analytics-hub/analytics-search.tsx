'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, MousePointerClick, RefreshCw, Search } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    AreaChart,
    Button,
    Card,
    EmptyState,
    KpiRow,
    PageHeader,
    Select,
    Skeleton,
    Table,
    type KpiTileProps,
} from '@/components/ui-kit';
import {
    BreakdownEntity,
    TimeseriesPoint,
    fetchBreakdown,
    fetchTimeseries,
    fmtNum,
    seriesForMetric,
} from './analytics-data';

const DAY_OPTIONS = [7, 30, 90];

interface SearchData {
    series: TimeseriesPoint[];
    queries: BreakdownEntity[];
    pages: BreakdownEntity[];
}

function sumMetric(points: TimeseriesPoint[], metric: string): number {
    return points.reduce((acc, point) => acc + (point.metrics[metric] || 0), 0);
}

/** position is an average — average it across days rather than summing */
function avgPosition(points: TimeseriesPoint[]): string {
    const values = points.map((point) => point.metrics.position || 0).filter((value) => value > 0);
    if (!values.length) return '—';
    return (values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(1);
}

export function AnalyticsSearch() {
    const { currentBrandId } = useCurrentBrand();
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<SearchData | null>(null);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            const [series, queries, pages] = await Promise.all([
                fetchTimeseries('search_console', d, currentBrandId, { entityType: 'site' }),
                fetchBreakdown('search_console', 'query', d, currentBrandId),
                fetchBreakdown('search_console', 'page_path', d, currentBrandId),
            ]);
            setData({
                series: series?.series || [],
                queries: (queries?.entities || []).sort((a, b) => (b.metrics.clicks || 0) - (a.metrics.clicks || 0)).slice(0, 25),
                pages: (pages?.entities || []).sort((a, b) => (b.metrics.clicks || 0) - (a.metrics.clicks || 0)).slice(0, 25),
            });
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(days); }, [load, days]);

    const kpiItems: KpiTileProps[] = data
        ? [
            { icon: MousePointerClick, label: 'Clicks', value: fmtNum(sumMetric(data.series, 'clicks')), pastel: 'mint' },
            { icon: Eye, label: 'Impressions', value: fmtNum(sumMetric(data.series, 'impressions')), pastel: 'blue' },
            {
                icon: Search,
                label: 'CTR',
                value: sumMetric(data.series, 'impressions') > 0
                    ? `${((sumMetric(data.series, 'clicks') / sumMetric(data.series, 'impressions')) * 100).toFixed(2)}%`
                    : '—',
                pastel: 'lemon',
            },
            { icon: Search, label: 'Avg position', value: avgPosition(data.series), sub: 'lower is better', pastel: 'peach' },
        ]
        : [];

    const chart = useMemo(
        () => data ? seriesForMetric(data.series, 'clicks', 'Clicks', '#10b981') : null,
        [data],
    );

    const hasData = (data?.series.length || 0) > 0;

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                icon={Search}
                title="Search"
                sub="Search Console — queries, pages, and positions"
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
                    </>
                }
            />

            {loading ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {Array.from({ length: 4 }, (_, index) => index).map((index) => <Skeleton key={index} className="h-24" />)}
                    </div>
                    <Skeleton className="h-56" />
                </div>
            ) : !hasData ? (
                <EmptyState
                    icon={Search}
                    title="No Search Console data yet"
                    note="Connect a Search Console site — query and page performance lands here after the first sync."
                    cta={
                        <Button variant="brand" asChild>
                            <Link href="/analytics/sources">Connect Search Console</Link>
                        </Button>
                    }
                />
            ) : (
                <>
                    <KpiRow items={kpiItems} cols={4} />

                    {chart && (
                        <Card title="Clicks over time" icon={MousePointerClick}>
                            <div className="h-48"><AreaChart series={chart.series} labels={chart.labels} /></div>
                        </Card>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card title="Top queries">
                            <Table
                                columns={[
                                    { key: 'query', label: 'Query' },
                                    { key: 'clicks', label: 'Clicks', align: 'right', mono: true },
                                    { key: 'impressions', label: 'Impr.', align: 'right', mono: true },
                                ]}
                                rows={data!.queries.map((query) => ({
                                    query: (query.entityName || query.entityId).slice(0, 60),
                                    clicks: fmtNum(query.metrics.clicks),
                                    impressions: fmtNum(query.metrics.impressions),
                                }))}
                            />
                        </Card>
                        <Card title="Top pages">
                            <Table
                                columns={[
                                    { key: 'page', label: 'Page' },
                                    { key: 'clicks', label: 'Clicks', align: 'right', mono: true },
                                    { key: 'impressions', label: 'Impr.', align: 'right', mono: true },
                                ]}
                                rows={data!.pages.map((page) => ({
                                    page: (page.entityName || page.entityId).replace(/^https?:\/\/[^/]+/, '').slice(0, 60) || '/',
                                    clicks: fmtNum(page.metrics.clicks),
                                    impressions: fmtNum(page.metrics.impressions),
                                }))}
                            />
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
