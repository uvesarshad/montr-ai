'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Share2 } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    Button,
    Card,
    Chip,
    EmptyState,
    PageHeader,
    Select,
    Skeleton,
    Table,
    type ChipTone,
} from '@/components/ui-kit';
import { BreakdownEntity, fetchBreakdown, fmtNum, rangeForDays, type AnalyticsSourceType } from './analytics-data';

const DAY_OPTIONS = [7, 30, 90];

const SOCIAL_SOURCES: { sourceType: AnalyticsSourceType; label: string; tone: ChipTone }[] = [
    { sourceType: 'facebook', label: 'Facebook', tone: 'info' },
    { sourceType: 'instagram', label: 'Instagram', tone: 'purple' },
    { sourceType: 'threads', label: 'Threads', tone: 'gray' },
    { sourceType: 'youtube', label: 'YouTube', tone: 'danger' },
    { sourceType: 'linkedin', label: 'LinkedIn', tone: 'info' },
    { sourceType: 'tiktok', label: 'TikTok', tone: 'gray' },
    { sourceType: 'x', label: 'X', tone: 'gray' },
];

/** account-level rows come back under different entity types per platform */
const ACCOUNT_ENTITY_TYPES = ['account', 'page', 'channel'];

interface AccountRow {
    key: string;
    platform: string;
    tone: ChipTone;
    name: string;
    metrics: Record<string, number>;
}

/** Render the metric set each platform actually reports */
function metricSummary(metrics: Record<string, number>): string {
    const parts: string[] = [];
    if (metrics.impressions) parts.push(`${fmtNum(metrics.impressions)} impressions`);
    if (metrics.reach) parts.push(`${fmtNum(metrics.reach)} reach`);
    if (metrics.views) parts.push(`${fmtNum(metrics.views)} views`);
    if (metrics.minutes_watched) parts.push(`${fmtNum(metrics.minutes_watched)} min watched`);
    if (metrics.engagements) parts.push(`${fmtNum(metrics.engagements)} engagements`);
    if (metrics.posts) parts.push(`${fmtNum(metrics.posts)} posts`);
    if (metrics.likes) parts.push(`${fmtNum(metrics.likes)} likes`);
    if (metrics.reposts) parts.push(`${fmtNum(metrics.reposts)} reposts`);
    if (metrics.new_followers) parts.push(`${fmtNum(metrics.new_followers)} new followers`);
    if (metrics.subscribers_gained) parts.push(`+${fmtNum(metrics.subscribers_gained)} subs`);
    return parts.join(' · ') || '—';
}

function followerTotal(metrics: Record<string, number>): string {
    const total = metrics.followers_total || metrics.subscribers_total;
    return total ? fmtNum(total) : '—';
}

export function AnalyticsSocial() {
    const { currentBrandId } = useCurrentBrand();
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<AccountRow[]>([]);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            const results = await Promise.all(
                SOCIAL_SOURCES.flatMap((source) =>
                    ACCOUNT_ENTITY_TYPES.map((entityType) =>
                        fetchBreakdown(source.sourceType, entityType, d, currentBrandId)
                            .then((response) => ({ source, entities: response?.entities || [] })),
                    ),
                ),
            );

            const next: AccountRow[] = [];
            for (const { source, entities } of results) {
                for (const entity of entities as BreakdownEntity[]) {
                    next.push({
                        key: `${source.sourceType}-${entity.entityId}`,
                        platform: source.label,
                        tone: source.tone,
                        name: entity.entityName || entity.entityId,
                        metrics: entity.metrics,
                    });
                }
            }
            setRows(next);
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(days); }, [load, days]);

    const { dateFrom, dateTo } = rangeForDays(days);

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6">
            <PageHeader
                icon={Share2}
                title="Social"
                sub={`Account-level performance across connected social profiles · ${dateFrom} → ${dateTo}`}
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
                <div className="space-y-3">
                    {Array.from({ length: 4 }, (_, index) => index).map((index) => <Skeleton key={index} className="h-16" />)}
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={Share2}
                    title="No account-level social data yet"
                    note="Connected social profiles sync account metrics every few hours. Post-level analytics live in the Social module."
                    cta={
                        <Button variant="brand" asChild>
                            <Link href="/settings?tab=connections">Manage connections</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <Table
                        columns={[
                            {
                                key: 'name',
                                label: 'Account',
                                render: (_value, row) => (
                                    <span className="flex items-center gap-2">
                                        <Chip tone={(row as unknown as AccountRow).tone}>{(row as unknown as AccountRow).platform}</Chip>
                                        <span className="truncate font-medium">{String(row.name)}</span>
                                    </span>
                                ),
                            },
                            { key: 'followers', label: 'Followers', align: 'right', mono: true },
                            { key: 'activity', label: 'Period activity' },
                        ]}
                        rows={rows.map((row) => ({
                            name: row.name,
                            platform: row.platform,
                            tone: row.tone,
                            followers: followerTotal(row.metrics),
                            activity: metricSummary(row.metrics),
                        }))}
                    />
                    <p className="mt-3 text-xs text-muted-foreground">
                        Follower counts are the latest snapshot; activity metrics are summed over the selected period.
                        Post-level performance lives in <Link href="/social/analytics" className="text-brand-strong hover:underline">Social → Analytics</Link>.
                    </p>
                </Card>
            )}
        </div>
    );
}
