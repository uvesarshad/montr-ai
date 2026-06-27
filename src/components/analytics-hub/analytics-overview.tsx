'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, DollarSign, Globe, RefreshCw, Search, Share2 } from 'lucide-react';
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
    TextEffect,
    type KpiTileProps,
} from '@/components/ui-kit';
import {
    SummaryResponse,
    TimeseriesPoint,
    fetchSummary,
    fetchTimeseries,
    fmtMoney,
    fmtNum,
    seriesForMetric,
} from './analytics-data';

const DAY_OPTIONS = [7, 30, 90];

interface OverviewData {
    all: SummaryResponse | null;
    ga4Series: TimeseriesPoint[];
    gscSeries: TimeseriesPoint[];
}

export function AnalyticsOverview() {
    const { currentBrandId } = useCurrentBrand();
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<OverviewData | null>(null);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            const [all, ga4Series, gscSeries] = await Promise.all([
                fetchSummary(null, d, currentBrandId),
                fetchTimeseries('ga4', d, currentBrandId, { entityType: 'property' }),
                fetchTimeseries('search_console', d, currentBrandId, { entityType: 'site' }),
            ]);
            setData({
                all,
                ga4Series: ga4Series?.series || [],
                gscSeries: gscSeries?.series || [],
            });
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(days); }, [load, days]);

    const bySource = data?.all?.bySourceType || {};
    const adsSpend = (bySource.meta_ads?.spend || 0) + (bySource.google_ads?.spend || 0);
    const sessions = bySource.ga4?.sessions || 0;
    const searchClicks = bySource.search_console?.clicks || 0;
    const conversions = (bySource.ga4?.conversions || 0) + (bySource.meta_ads?.conversions || 0) + (bySource.google_ads?.conversions || 0);

    const hasAnyData = adsSpend > 0 || sessions > 0 || searchClicks > 0 || (data?.all?.sources || 0) > 0;

    const kpiItems: KpiTileProps[] = [
        { icon: DollarSign, label: 'Ads spend', value: fmtMoney(adsSpend), pastel: 'violet' },
        { icon: Globe, label: 'Sessions (GA4)', value: fmtNum(sessions), pastel: 'blue' },
        { icon: Search, label: 'Search clicks (GSC)', value: fmtNum(searchClicks), pastel: 'mint' },
        { icon: BarChart3, label: 'Conversions', value: fmtNum(conversions), sub: 'GA4 + ads', pastel: 'peach' },
    ];

    const trafficChart = useMemo(
        () => data ? seriesForMetric(data.ga4Series, 'sessions', 'Sessions', '#3b82f6') : null,
        [data],
    );
    const searchChart = useMemo(
        () => data ? seriesForMetric(data.gscSeries, 'clicks', 'Clicks', '#10b981') : null,
        [data],
    );

    const sections = [
        { href: '/analytics/traffic', icon: Globe, title: 'Traffic', note: 'GA4 sessions, channels, landing pages' },
        { href: '/analytics/search', icon: Search, title: 'Search', note: 'Search Console queries, pages, positions' },
        { href: '/analytics/social', icon: Share2, title: 'Social', note: 'Account-level reach and follower growth' },
        { href: '/ads', icon: DollarSign, title: 'Ads', note: 'Campaign spend and performance' },
    ];

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                icon={BarChart3}
                title={<TextEffect per="word" preset="fade-in-blur">Analytics</TextEffect>}
                sub="Everything your connected sources are telling you, in one place"
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
            ) : !hasAnyData ? (
                <EmptyState
                    icon={BarChart3}
                    title="No analytics sources yet"
                    note="Connect Google Analytics, Search Console, or an ad account to light this up."
                    cta={
                        <Button variant="brand" asChild>
                            <Link href="/analytics/sources">Connect a source</Link>
                        </Button>
                    }
                />
            ) : (
                <>
                    <KpiRow items={kpiItems} cols={4} />

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card title="Website sessions" icon={Globe}>
                            {trafficChart ? (
                                <div className="h-44"><AreaChart series={trafficChart.series} labels={trafficChart.labels} /></div>
                            ) : (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Connect GA4 in <Link href="/analytics/sources" className="text-brand-strong hover:underline">Sources</Link> to see traffic.
                                </p>
                            )}
                        </Card>
                        <Card title="Search clicks" icon={Search}>
                            {searchChart ? (
                                <div className="h-44"><AreaChart series={searchChart.series} labels={searchChart.labels} /></div>
                            ) : (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Connect Search Console in <Link href="/analytics/sources" className="text-brand-strong hover:underline">Sources</Link> to see search performance.
                                </p>
                            )}
                        </Card>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {sections.map((section) => {
                            const Icon = section.icon;
                            return (
                                <Link key={section.href} href={section.href} className="block">
                                    <Card lift spotlight bodyClassName="p-4">
                                        <Icon className="size-5 text-brand-strong" />
                                        <h3 className="mt-2 text-sm font-semibold">{section.title}</h3>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{section.note}</p>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
