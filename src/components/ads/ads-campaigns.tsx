'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Megaphone, Plus, RefreshCw } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    Button,
    Chip,
    DataTable,
    PageHeader,
    Select,
    type DataTableColumn,
} from '@/components/ui-kit';
import {
    PLATFORM_LABELS,
    fetchCampaignBreakdown,
    fmtMoney,
    fmtNum,
    fmtPct,
    type AdsPlatform,
} from './ads-data';

const DAY_OPTIONS = [7, 30, 90];

interface CampaignRow {
    id: string;
    entityId: string;
    name: string;
    platform: AdsPlatform;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;       // clicks / impressions
    cpc: number;       // spend / clicks
}

type PlatformFilter = 'all' | AdsPlatform;

export function AdsCampaigns() {
    const { push } = useRouter();
    const { currentBrandId } = useCurrentBrand();
    const [rows, setRows] = useState<CampaignRow[]>([]);
    const [days, setDays] = useState(30);
    const [platform, setPlatform] = useState<PlatformFilter>('all');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            const [meta, google] = await Promise.all([
                fetchCampaignBreakdown('meta_ads', d, currentBrandId),
                fetchCampaignBreakdown('google_ads', d, currentBrandId),
            ]);

            const next: CampaignRow[] = [...(meta?.entities || []), ...(google?.entities || [])].map((entity) => {
                const spend = entity.metrics.spend || 0;
                const impressions = entity.metrics.impressions || 0;
                const clicks = entity.metrics.clicks || 0;
                return {
                    id: `${entity.sourceType}-${entity.entityId}`,
                    entityId: entity.entityId,
                    name: entity.entityName || entity.entityId,
                    platform: entity.sourceType as AdsPlatform,
                    spend,
                    impressions,
                    clicks,
                    conversions: entity.metrics.conversions || 0,
                    ctr: impressions > 0 ? clicks / impressions : 0,
                    cpc: clicks > 0 ? spend / clicks : 0,
                };
            }).sort((a, b) => b.spend - a.spend);

            setRows(next);
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(days); }, [load, days]);

    const visibleRows = useMemo(
        () => (platform === 'all' ? rows : rows.filter((row) => row.platform === platform)),
        [rows, platform],
    );

    const columns: DataTableColumn<CampaignRow>[] = useMemo(() => [
        {
            accessorKey: 'name',
            header: 'Campaign',
            cell: ({ row }) => (
                <span className="block max-w-[280px] truncate font-medium">{row.original.name}</span>
            ),
        },
        {
            accessorKey: 'platform',
            header: 'Platform',
            cell: ({ row }) => (
                <Chip tone={row.original.platform === 'meta_ads' ? 'info' : 'purple'}>
                    {PLATFORM_LABELS[row.original.platform]}
                </Chip>
            ),
        },
        {
            accessorKey: 'spend',
            header: 'Spend',
            cell: ({ row }) => <span className="tabular-nums">{fmtMoney(row.original.spend)}</span>,
        },
        {
            accessorKey: 'impressions',
            header: 'Impressions',
            cell: ({ row }) => <span className="tabular-nums">{fmtNum(row.original.impressions)}</span>,
        },
        {
            accessorKey: 'clicks',
            header: 'Clicks',
            cell: ({ row }) => <span className="tabular-nums">{fmtNum(row.original.clicks)}</span>,
        },
        {
            accessorKey: 'ctr',
            header: 'CTR',
            cell: ({ row }) => <span className="tabular-nums">{fmtPct(row.original.ctr)}</span>,
        },
        {
            accessorKey: 'cpc',
            header: 'CPC',
            cell: ({ row }) => <span className="tabular-nums">{fmtMoney(row.original.cpc)}</span>,
        },
        {
            accessorKey: 'conversions',
            header: 'Conv.',
            cell: ({ row }) => <span className="tabular-nums">{fmtNum(row.original.conversions)}</span>,
        },
    ], []);

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                icon={Megaphone}
                title="Campaigns"
                sub="Performance of every campaign across your connected ad accounts"
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
                        <Button variant="brand" size="sm" icon={Plus} asChild>
                            <Link href="/ads/campaigns/new">New campaign</Link>
                        </Button>
                    </>
                }
            />

            <div className="flex flex-wrap gap-1.5">
                {([['all', 'All'], ['meta_ads', 'Meta'], ['google_ads', 'Google']] as [PlatformFilter, string][]).map(([value, label]) => (
                    <Chip
                        key={value}
                        tone={platform === value ? 'brand' : 'gray'}
                        selected={platform === value}
                        onClick={() => setPlatform(value)}
                    >
                        {label}
                    </Chip>
                ))}
            </div>

            <DataTable
                columns={columns}
                data={visibleRows}
                loading={loading}
                getRowId={(row) => row.id}
                onRowClick={(row) => push(
                    `/ads/campaigns/${row.platform}/${encodeURIComponent(row.entityId)}?name=${encodeURIComponent(row.name)}`,
                )}
                emptyTitle="No campaign data yet"
                emptyNote="Connect an ad account and wait for the first sync, or hit Refresh after syncing."
                mobileCard={(row) => (
                    <div className="space-y-1 rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{row.name}</span>
                            <Chip tone={row.platform === 'meta_ads' ? 'info' : 'purple'}>
                                {PLATFORM_LABELS[row.platform]}
                            </Chip>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {fmtMoney(row.spend)} · {fmtNum(row.impressions)} impr · {fmtNum(row.clicks)} clicks · {fmtNum(row.conversions)} conv
                        </div>
                    </div>
                )}
            />
        </div>
    );
}
