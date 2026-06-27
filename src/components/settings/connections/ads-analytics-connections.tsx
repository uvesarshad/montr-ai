'use client';

import { useCallback, useEffect, useMemo, useState, ElementType } from 'react';
import { AlertCircle, BarChart3, Link as LinkIcon, Megaphone, Search } from 'lucide-react';
import {
    Button,
    Card,
    Chip,
    Spinner,
    ConfirmDialog,
    EmptyState,
} from '@/components/ui-kit';
import { FacebookLogo } from '@/components/social-icons';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Brand {
    _id: string;
    name: string;
    handle: string;
}

type ProviderId = 'google_ads' | 'meta_ads' | 'ga4' | 'search_console';

interface AdsConnection {
    _id: string;
    providerId: ProviderId;
    label: string;
    sub?: string;
    lastError?: string | null;
}

interface ProviderConfig {
    id: ProviderId;
    kind: 'ads' | 'analytics';
    name: string;
    description: string;
    icon: ElementType;
    color: string;
    oauthPath: string;
}

const PROVIDERS: ProviderConfig[] = [
    {
        id: 'google_ads',
        kind: 'ads',
        name: 'Google Ads',
        description: 'Connect your Google Ads account to track spend, performance, and campaign insights.',
        icon: Megaphone,
        color: 'text-blue-500',
        oauthPath: '/api/ads/oauth/google-ads',
    },
    {
        id: 'meta_ads',
        kind: 'ads',
        name: 'Meta Ads',
        description: 'Connect your Meta ad account to track Facebook & Instagram campaign performance.',
        icon: FacebookLogo,
        color: 'text-blue-600',
        oauthPath: '/api/ads/oauth/meta-ads',
    },
    {
        id: 'ga4',
        kind: 'analytics',
        name: 'Google Analytics',
        description: 'Connect a GA4 property to bring website traffic and conversion data into your analytics.',
        icon: BarChart3,
        color: 'text-amber-500',
        oauthPath: '/api/analytics/oauth/ga4',
    },
    {
        id: 'search_console',
        kind: 'analytics',
        name: 'Search Console',
        description: 'Connect a Search Console site to track search queries, clicks, and rankings.',
        icon: Search,
        color: 'text-emerald-600',
        oauthPath: '/api/analytics/oauth/search_console',
    },
];

interface AdsAnalyticsConnectionsProps {
    viewMode?: 'grid' | 'list';
    searchQuery?: string;
    hideTitle?: boolean;
    selectedBrandId?: string;
    brands?: Brand[];
}

export function AdsAnalyticsConnections({
    viewMode = 'grid',
    searchQuery = '',
    hideTitle = false,
    selectedBrandId = '',
    brands = [],
}: AdsAnalyticsConnectionsProps) {
    const { toast } = useToast();

    const [connections, setConnections] = useState<AdsConnection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState<ProviderId | null>(null);
    const [connectionToDisconnect, setConnectionToDisconnect] = useState<AdsConnection | null>(null);

    const fetchConnections = useCallback(async () => {
        if (!selectedBrandId) return;

        try {
            const [accountsRes, sourcesRes] = await Promise.all([
                fetch(`/api/v2/ads/accounts?brandId=${selectedBrandId}`),
                fetch(`/api/v2/analytics/sources?brandId=${selectedBrandId}`),
            ]);

            const next: AdsConnection[] = [];

            if (accountsRes.ok) {
                const data = await accountsRes.json();
                for (const account of data.accounts || []) {
                    next.push({
                        _id: account._id,
                        providerId: account.platform,
                        label: account.accountName,
                        sub: account.externalAccountId,
                        lastError: account.lastError,
                    });
                }
            }

            if (sourcesRes.ok) {
                const data = await sourcesRes.json();
                for (const source of data.sources || []) {
                    next.push({
                        _id: source._id,
                        providerId: source.sourceType,
                        label: source.displayName,
                        sub: source.externalId !== source.displayName ? source.externalId : undefined,
                        lastError: source.lastError,
                    });
                }
            }

            setConnections(next);
        } catch (error) {
            console.error('Failed to fetch ads/analytics connections:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedBrandId]);

    useEffect(() => {
        if (selectedBrandId) {
            fetchConnections();
        } else {
            setIsLoading(false);
        }
    }, [selectedBrandId, fetchConnections]);

    // Handle OAuth callback postMessages from the popup tab
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Security: only accept messages from our own origin
            if (event.origin !== window.location.origin) return;
            if (!event.data || event.data.type !== 'OAUTH_CALLBACK') return;

            const { connected } = event.data;
            if (connected && PROVIDERS.some((provider) => provider.id === connected)) {
                toast({
                    title: 'Account Connected!',
                    description: `Successfully connected your ${PROVIDERS.find((p) => p.id === connected)?.name} account.`,
                });
                fetchConnections();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [fetchConnections, toast]);

    const handleConnect = useCallback((provider: ProviderConfig) => {
        if (!selectedBrandId) {
            toast({ variant: 'destructive', title: 'Please select or create a brand first' });
            return;
        }

        setIsConnecting(provider.id);
        window.open(`${provider.oauthPath}?brandId=${selectedBrandId}`, '_blank');
        setTimeout(() => setIsConnecting(null), 2000);
    }, [selectedBrandId, toast]);

    const handleDisconnect = async (connection: AdsConnection) => {
        const isAds = connection.providerId === 'google_ads' || connection.providerId === 'meta_ads';
        const endpoint = isAds
            ? `/api/v2/ads/accounts/${connection._id}`
            : `/api/v2/analytics/sources/${connection._id}`;

        try {
            const response = await fetch(endpoint, { method: 'DELETE' });

            if (response.ok) {
                setConnections((prev) => prev.filter((candidate) => candidate._id !== connection._id));
                toast({ title: 'Connection removed' });
            } else {
                throw new Error('disconnect failed');
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Failed to disconnect' });
            throw error;
        }
    };

    const filteredProviders = useMemo(() => {
        if (!searchQuery) return PROVIDERS;
        return PROVIDERS.filter((provider) =>
            provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            provider.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Spinner size={28} />
            </div>
        );
    }

    if (filteredProviders.length === 0 && searchQuery) {
        return null; // Hide section if no results match search
    }

    return (
        <div className="contents">
            {!hideTitle && (
                <div className="col-span-full mb-6 flex items-center justify-between">
                    <h3 className="text-lg font-medium">Ads &amp; Analytics</h3>
                </div>
            )}

            {brands.length === 0 ? (
                <div className="col-span-full">
                    <EmptyState
                        icon={AlertCircle}
                        title="No Brands Yet"
                        note="Please create a brand in the main settings to start connecting ad accounts and analytics sources."
                    />
                </div>
            ) : (
                filteredProviders.map((provider) => {
                    const providerConnections = connections.filter((connection) => connection.providerId === provider.id);
                    const isConnected = providerConnections.length > 0;
                    const Icon = provider.icon;

                    const connectionRows = providerConnections.map((connection) => (
                        <div
                            key={connection._id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-2"
                        >
                            <div className="min-w-0 text-sm font-medium text-foreground">
                                <span className="block truncate">{connection.label}</span>
                                {connection.sub && (
                                    <span className="block truncate text-xs font-normal text-muted-foreground">{connection.sub}</span>
                                )}
                                {connection.lastError && (
                                    <span className="block truncate text-xs font-normal text-danger">{connection.lastError}</span>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 text-danger hover:bg-danger-muted"
                                onClick={() => setConnectionToDisconnect(connection)}
                            >
                                Disconnect
                            </Button>
                        </div>
                    ));

                    if (viewMode === 'list') {
                        return (
                            <Card
                                key={provider.id}
                                className={cn(isConnected && 'border-brand/40 bg-brand-muted/30')}
                                bodyClassName="p-4"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <span className={cn(
                                            'grid size-9 place-items-center rounded-lg',
                                            isConnected ? 'bg-card shadow-sm' : 'bg-muted'
                                        )}>
                                            <Icon className={cn('size-5', provider.color)} />
                                        </span>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold">{provider.name}</span>
                                                {isConnected && (
                                                    <Chip tone="ok" dot>
                                                        {providerConnections.length > 1
                                                            ? `${providerConnections.length} connected`
                                                            : 'Connected'}
                                                    </Chip>
                                                )}
                                            </div>
                                            <p className="line-clamp-1 text-xs text-muted-foreground">{provider.description}</p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={isConnected ? 'outline' : 'brand'}
                                        icon={isConnecting === provider.id ? undefined : LinkIcon}
                                        onClick={() => handleConnect(provider)}
                                        disabled={isConnecting === provider.id}
                                    >
                                        {isConnecting === provider.id ? <Spinner size={14} /> : null}
                                        {isConnected ? 'Add Another' : 'Connect'}
                                    </Button>
                                </div>
                                {connectionRows.length > 0 && (
                                    <div className="mt-3 space-y-2">{connectionRows}</div>
                                )}
                            </Card>
                        );
                    }

                    return (
                        <Card
                            key={provider.id}
                            lift
                            className={cn('h-full', isConnected && 'border-brand/40 bg-brand-muted/30')}
                            bodyClassName="flex flex-col p-4"
                        >
                            <div className="flex items-start justify-between">
                                <span className={cn(
                                    'grid size-10 place-items-center rounded-full',
                                    isConnected ? 'bg-card' : 'bg-muted'
                                )}>
                                    <Icon className={cn('size-6', provider.color)} />
                                </span>
                                {isConnected ? (
                                    <Chip tone="ok" dot>
                                        {providerConnections.length > 1
                                            ? `${providerConnections.length} connected`
                                            : 'Connected'}
                                    </Chip>
                                ) : (
                                    <Chip tone="gray">Not Connected</Chip>
                                )}
                            </div>
                            <div className="mt-4 flex-1">
                                <h4 className="mb-2 text-base font-semibold">{provider.name}</h4>
                                <p className="line-clamp-2 text-[13px] text-muted-foreground">
                                    {provider.description}
                                </p>
                                {connectionRows.length > 0 && (
                                    <div className="mt-4 space-y-2">{connectionRows}</div>
                                )}
                            </div>
                            <div className="mt-4">
                                <Button
                                    className="w-full"
                                    variant={isConnected ? 'outline' : 'brand'}
                                    icon={isConnecting === provider.id ? undefined : LinkIcon}
                                    onClick={() => handleConnect(provider)}
                                    disabled={isConnecting === provider.id}
                                >
                                    {isConnecting === provider.id ? <Spinner size={14} /> : null}
                                    {isConnected ? 'Add Another' : `Connect ${provider.name}`}
                                </Button>
                            </div>
                        </Card>
                    );
                })
            )}

            {/* Disconnect confirm */}
            <ConfirmDialog
                open={!!connectionToDisconnect}
                onOpenChange={(open) => { if (!open) setConnectionToDisconnect(null); }}
                title="Disconnect this account?"
                description={connectionToDisconnect
                    ? `${connectionToDisconnect.label} will be disconnected and its synced data will stop updating.`
                    : undefined}
                confirmLabel="Disconnect"
                onConfirm={() => { if (connectionToDisconnect) return handleDisconnect(connectionToDisconnect); }}
            />
        </div>
    );
}
