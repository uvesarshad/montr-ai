'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Globe, RefreshCw, Users } from 'lucide-react';
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

interface TrafficData {
    series: TimeseriesPoint[];
    channels: BreakdownEntity[];
    pages: BreakdownEntity[];
}

function sumMetric(points: TimeseriesPoint[], metric: string): number {
    return points.reduce((acc, point) => acc + (point.metrics[metric] || 0), 0);
}

export function AnalyticsTraffic() {
    const { currentBrandId } = useCurrentBrand();
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<TrafficData | null>(null);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            const [series, channels, pages] = await Promise.all([
                fetchTimeseries('ga4', d, currentBrandId, { entityType: 'property' }),
                fetchBreakdown('ga4', 'channel_group', d, currentBrandId),
                fetchBreakdown('ga4', 'page_path', d, currentBrandId),
            ]);
            setData({
                series: series?.series || [],
                channels: (channels?.entities || []).sort((a, b) => (b.metrics.sessions || 0) - (a.metrics.sessions || 0)),
                pages: (pages?.entities || []).sort((a, b) => (b.metrics.sessions || 0) - (a.metrics.sessions || 0)).slice(0, 25),
            });
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(days); }, [load, days]);

    const kpiItems: KpiTileProps[] = data
        ? [
            { icon: Globe, label: 'Sessions', value: fmtNum(sumMetric(data.series, 'sessions')), pastel: 'blue' },
            { icon: Users, label: 'Users', value: fmtNum(sumMetric(data.series, 'users')), sub: `${fmtNum(sumMetric(data.series, 'new_users'))} new`, pastel: 'mint' },
            { icon: Globe, label: 'Page views', value: fmtNum(sumMetric(data.series, 'page_views')), pastel: 'lemon' },
            { icon: Globe, label: 'Conversions', value: fmtNum(sumMetric(data.series, 'conversions')), sub: `${fmtNum(sumMetric(data.series, 'engaged_sessions'))} engaged sessions`, pastel: 'peach' },
        ]
        : [];

    const chart = useMemo(
        () => data ? seriesForMetric(data.series, 'sessions', 'Sessions', '#3b82f6') : null,
        [data],
    );

    const hasData = (data?.series.length || 0) > 0;

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                icon={Globe}
                title="Traffic"
                sub="Google Analytics 4 — sessions, channels, and landing pages"
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
                    icon={Globe}
                    title="No GA4 data yet"
                    note="Connect a Google Analytics property — daily traffic lands here after the first sync."
                    cta={
                        <Button variant="brand" asChild>
                            <Link href="/analytics/sources">Connect GA4</Link>
                        </Button>
                    }
                />
            ) : (
                <>
                    <KpiRow items={kpiItems} cols={4} />

                    {chart && (
                        <Card title="Sessions over time" icon={Globe}>
                            <div className="h-48"><AreaChart series={chart.series} labels={chart.labels} /></div>
                        </Card>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card title="Channels">
                            <Table
                                columns={[
                                    { key: 'name', label: 'Channel' },
                                    { key: 'sessions', label: 'Sessions', align: 'right', mono: true },
                                    { key: 'users', label: 'Users', align: 'right', mono: true },
                                    { key: 'conversions', label: 'Conv.', align: 'right', mono: true },
                                ]}
                                rows={data!.channels.map((channel) => ({
                                    name: channel.entityName || channel.entityId,
                                    sessions: fmtNum(channel.metrics.sessions),
                                    users: fmtNum(channel.metrics.users),
                                    conversions: fmtNum(channel.metrics.conversions),
                                }))}
                            />
                        </Card>
                        <Card title="Top landing pages">
                            <Table
                                columns={[
                                    { key: 'page', label: 'Page' },
                                    { key: 'sessions', label: 'Sessions', align: 'right', mono: true },
                                    { key: 'users', label: 'Users', align: 'right', mono: true },
                                ]}
                                rows={data!.pages.map((page) => ({
                                    page: (page.entityName || page.entityId).slice(0, 60),
                                    sessions: fmtNum(page.metrics.sessions),
                                    users: fmtNum(page.metrics.users),
                                }))}
                            />
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
