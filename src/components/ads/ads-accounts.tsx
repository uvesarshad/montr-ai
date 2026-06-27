'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Plug, Plus, RefreshCw } from 'lucide-react';
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
import { PLATFORM_LABELS, fetchAdAccounts, type AdAccountDto } from './ads-data';

export function AdsAccounts() {
    const { currentBrandId } = useCurrentBrand();
    const { toast } = useToast();

    const [accounts, setAccounts] = useState<AdAccountDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchAdAccounts(currentBrandId);
            setAccounts(data?.accounts || []);
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(); }, [load]);

    const handleSyncNow = useCallback(async (account: AdAccountDto) => {
        setSyncingId(account._id);
        try {
            const response = await fetch('/api/v2/analytics/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: account._id, sourceType: account.platform, days: 30 }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Sync failed');
            toast({ title: 'Sync queued', description: `${account.accountName} will refresh within a minute.` });
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
                title="Ad Accounts"
                sub="Connected Google Ads and Meta ad accounts feeding your insights"
                actions={
                    <Button variant="brand" size="sm" icon={Plus} asChild>
                        <Link href="/settings?tab=connections">Connect account</Link>
                    </Button>
                }
            />

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20" />)}
                </div>
            ) : accounts.length === 0 ? (
                <EmptyState
                    icon={Plug}
                    title="No ad accounts connected"
                    note="Connect Google Ads or Meta Ads from Settings → Connections to start syncing campaign insights."
                    cta={
                        <Button variant="brand" asChild>
                            <Link href="/settings?tab=connections">Open Connections</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {accounts.map((account) => (
                        <Card key={account._id} bodyClassName="p-4">
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-semibold">{account.accountName}</span>
                                        <Chip tone={account.platform === 'meta_ads' ? 'info' : 'purple'}>
                                            {PLATFORM_LABELS[account.platform]}
                                        </Chip>
                                        {!account.isActive && <Chip tone="gray">Inactive</Chip>}
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {account.externalAccountId}
                                        {account.currencyCode ? ` · ${account.currencyCode}` : ''}
                                        {account.timezone ? ` · ${account.timezone}` : ''}
                                        {account.lastSyncedAt
                                            ? ` · synced ${formatDistanceToNow(new Date(account.lastSyncedAt), { addSuffix: true })}`
                                            : ' · never synced'}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    icon={RefreshCw}
                                    disabled={syncingId !== null}
                                    onClick={() => handleSyncNow(account)}
                                >
                                    {syncingId === account._id ? 'Queuing…' : 'Sync now'}
                                </Button>
                            </div>
                            {account.lastError && (
                                <Banner tone="danger" className="mt-3">
                                    {account.lastError}
                                </Banner>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
