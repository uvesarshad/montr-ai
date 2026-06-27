'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DollarSign, Eye, Megaphone, MousePointerClick, Plug, RefreshCw, Target } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    AreaChart,
    Button,
    Card,
    Chip,
    EmptyState,
    KpiRow,
    PageHeader,
    Select,
    Skeleton,
    TextEffect,
    type KpiTileProps,
} from '@/components/ui-kit';
import {
    AdsSummary,
    BreakdownEntity,
    PLATFORM_LABELS,
    TimeseriesPoint,
    fetchAdAccounts,
    fetchAdsSummary,
    fetchAdsTimeseries,
    fetchCampaignBreakdown,
    fmtMoney,
    fmtNum,
    type AdsPlatform,
} from './ads-data';
import { AdsInsightsCard } from './ads-insights-card';

const DAY_OPTIONS = [7, 30, 90];

const SERIES_COLORS: Record<AdsPlatform, string> = {
    meta_ads: '#3b82f6',
    google_ads: '#7c5cff',
};

interface OverviewData {
    summaries: Partial<Record<AdsPlatform, AdsSummary>>;
    series: Partial<Record<AdsPlatform, TimeseriesPoint[]>>;
    topCampaigns: BreakdownEntity[];
    hasAccounts: boolean;
    currency: string;
}

export function AdsOverview() {
    const { currentBrandId } = useCurrentBrand();
    const [data, setData] = useState<OverviewData | null>(null);
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            const [accounts, metaSummary, googleSummary, metaSeries, googleSeries, metaCampaigns, googleCampaigns] =
                await Promise.all([
                    fetchAdAccounts(currentBrandId),
                    fetchAdsSummary('meta_ads', d, currentBrandId),
                    fetchAdsSummary('google_ads', d, currentBrandId),
                    fetchAdsTimeseries('meta_ads', d, currentBrandId),
                    fetchAdsTimeseries('google_ads', d, currentBrandId),
                    fetchCampaignBreakdown('meta_ads', d, currentBrandId),
                    fetchCampaignBreakdown('google_ads', d, currentBrandId),
                ]);

            const topCampaigns = [...(metaCampaigns?.entities || []), ...(googleCampaigns?.entities || [])]
                .sort((a, b) => (b.metrics.spend || 0) - (a.metrics.spend || 0))
                .slice(0, 5);

            setData({
                summaries: {
                    meta_ads: metaSummary || undefined,
                    google_ads: googleSummary || undefined,
                },
                series: {
                    meta_ads: metaSeries?.series || [],
                    google_ads: googleSeries?.series || [],
                },
                topCampaigns,
                hasAccounts: (accounts?.accounts.length || 0) > 0,
                currency: accounts?.accounts.find((account) => account.currencyCode)?.currencyCode || 'USD',
            });
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(days); }, [load, days]);

    const total = useCallback((metric: string) => {
        if (!data) return 0;
        return (data.summaries.meta_ads?.totals[metric] || 0) + (data.summaries.google_ads?.totals[metric] || 0);
    }, [data]);

    const split = useCallback((metric: string, money = false) => {
        if (!data) return undefined;
        const meta = data.summaries.meta_ads?.totals[metric] || 0;
        const google = data.summaries.google_ads?.totals[metric] || 0;
        if (!meta && !google) return undefined;
        const fmt = money ? (v: number) => fmtMoney(v, data.currency) : fmtNum;
        return `Meta ${fmt(meta)} · Google ${fmt(google)}`;
    }, [data]);

    const kpiItems: KpiTileProps[] = data
        ? [
            { icon: DollarSign, label: 'Spend', value: fmtMoney(total('spend'), data.currency), sub: split('spend', true), pastel: 'violet' },
            { icon: Eye, label: 'Impressions', value: fmtNum(total('impressions')), sub: split('impressions'), pastel: 'blue' },
            { icon: MousePointerClick, label: 'Clicks', value: fmtNum(total('clicks')), sub: split('clicks'), pastel: 'mint' },
            { icon: Target, label: 'Conversions', value: fmtNum(total('conversions')), sub: split('conversions'), pastel: 'peach' },
        ]
        : [];

    // Align both platforms' daily spend onto one date axis
    const chart = useMemo(() => {
        if (!data) return null;
        const dates = Array.from(new Set([
            ...(data.series.meta_ads || []).map((point) => point.date),
            ...(data.series.google_ads || []).map((point) => point.date),
        ])).sort();
        if (dates.length < 2) return null;

        const series = (['meta_ads', 'google_ads'] as AdsPlatform[])
            .map((platform) => {
                const byDate = new Map((data.series[platform] || []).map((point) => [point.date, point.metrics.spend || 0]));
                return {
                    name: PLATFORM_LABELS[platform],
                    color: SERIES_COLORS[platform],
                    data: dates.map((date) => byDate.get(date) || 0),
                };
            })
            .filter((entry) => entry.data.some((value) => value > 0));
        if (!series.length) return null;

        const tickEvery = Math.max(1, Math.floor(dates.length / 6));
        const labels = dates
            .map((date, index) => ({ x: index, t: date.slice(5) }))
            .filter((_, index) => index % tickEvery === 0);

        return { series, labels };
    }, [data]);

    if (!loading && data && !data.hasAccounts) {
        return (
            <div className="mx-auto max-w-5xl p-6">
                <EmptyState
                    icon={Plug}
                    title="No ad accounts connected"
                    note="Connect a Google Ads or Meta ad account to start tracking spend, performance, and leads."
                    cta={
                        <Button variant="brand" asChild>
                            <Link href="/ads/accounts">Connect an ad account</Link>
                        </Button>
                    }
                />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                icon={Megaphone}
                title={<TextEffect as="span" per="word" preset="fade-in-blur">Ads Overview</TextEffect>}
                sub="Cross-platform performance for your connected ad accounts"
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

            {loading || !data ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {Array.from({ length: 4 }, (_, index) => index).map((index) => <Skeleton key={index} className="h-24" />)}
                    </div>
                    <Skeleton className="h-56" />
                </div>
            ) : (
                <>
                    <KpiRow items={kpiItems} cols={4} />

                    <Card title="Spend over time" icon={DollarSign}>
                        {chart ? (
                            <div className="h-52">
                                <AreaChart series={chart.series} labels={chart.labels} />
                            </div>
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                No spend recorded in this period yet — data appears after the first sync.
                            </p>
                        )}
                    </Card>

                    <AdsInsightsCard brandId={currentBrandId} />

                    <Card title="Top campaigns by spend" icon={Megaphone}>
                        {data.topCampaigns.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                No campaign data in this period yet.
                            </p>
                        ) : (
                            <div className="divide-y divide-border">
                                {data.topCampaigns.map((campaign) => (
                                    <div key={`${campaign.sourceType}-${campaign.entityId}`} className="flex items-center justify-between gap-3 py-2.5">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <Chip tone={campaign.sourceType === 'meta_ads' ? 'info' : 'purple'}>
                                                {PLATFORM_LABELS[campaign.sourceType as AdsPlatform] ?? campaign.sourceType}
                                            </Chip>
                                            <span className="truncate text-sm font-medium">
                                                {campaign.entityName || campaign.entityId}
                                            </span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-4 text-sm tabular-nums text-muted-foreground">
                                            <span>{fmtNum(campaign.metrics.clicks)} clicks</span>
                                            <span className="font-semibold text-foreground">{fmtMoney(campaign.metrics.spend, data.currency)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}
