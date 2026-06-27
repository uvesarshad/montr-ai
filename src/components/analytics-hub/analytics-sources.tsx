'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { BarChart3, Plug, Plus, RefreshCw, Search } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    Banner,
    Button,
    Card,
    Chip,
    EmptyState,
    PageHeader,
    Skeleton,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { fetchAnalyticsSources, type AnalyticsSourceDto } from './analytics-data';

const TYPE_META = {
    ga4: { label: 'Google Analytics', icon: BarChart3 },
    search_console: { label: 'Search Console', icon: Search },
} as const;

export function AnalyticsSources() {
    const { currentBrandId } = useCurrentBrand();
    const { toast } = useToast();

    const [sources, setSources] = useState<AnalyticsSourceDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchAnalyticsSources(currentBrandId);
            setSources(data?.sources || []);
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(); }, [load]);

    const handleSyncNow = useCallback(async (source: AnalyticsSourceDto) => {
        setSyncingId(source._id);
        try {
            const response = await fetch('/api/v2/analytics/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: source._id, sourceType: source.sourceType, days: 30 }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Sync failed');
            toast({ title: 'Sync queued', description: `${source.displayName} will refresh within a minute.` });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Sync failed';
            toast({ variant: 'destructive', title: 'Could not queue sync', description: message });
        } finally {
            setSyncingId(null);
        }
    }, [toast]);

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6">
            <PageHeader
                icon={Plug}
                title="Analytics Sources"
                sub="Connected GA4 properties and Search Console sites feeding your analytics"
                actions={
                    <Button variant="brand" size="sm" icon={Plus} asChild>
                        <Link href="/settings?tab=connections">Connect source</Link>
                    </Button>
                }
            />

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }, (_, index) => index).map((index) => <Skeleton key={index} className="h-20" />)}
                </div>
            ) : sources.length === 0 ? (
                <EmptyState
                    icon={Plug}
                    title="No analytics sources connected"
                    note="Connect Google Analytics or Search Console from Settings → Connections to start syncing."
                    cta={
                        <Button variant="brand" asChild>
                            <Link href="/settings?tab=connections">Open Connections</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {sources.map((source) => {
                        const meta = TYPE_META[source.sourceType];
                        const Icon = meta.icon;
                        return (
                            <Card key={source._id} bodyClassName="p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                                            <Icon className="size-5 text-muted-foreground" />
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-semibold">{source.displayName}</span>
                                                <Chip tone="gray">{meta.label}</Chip>
                                                {!source.isActive && <Chip tone="gray">Inactive</Chip>}
                                            </div>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {source.externalId}
                                                {source.metadata?.accountName ? ` · ${source.metadata.accountName}` : ''}
                                                {source.lastSyncedAt
                                                    ? ` · synced ${formatDistanceToNow(new Date(source.lastSyncedAt), { addSuffix: true })}`
                                                    : ' · never synced'}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        icon={RefreshCw}
                                        disabled={syncingId !== null}
                                        onClick={() => handleSyncNow(source)}
                                    >
                                        {syncingId === source._id ? 'Queuing…' : 'Sync now'}
                                    </Button>
                                </div>
                                {source.lastError && (
                                    <Banner tone="danger" className="mt-3">
                                        {source.lastError}
                                    </Banner>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
