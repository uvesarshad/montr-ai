'use client';

/**
 * Registry-driven integrations hub (Settings → Connections).
 *
 * Renders one card per provider in src/lib/integrations/registry.ts:
 *  - OAuth providers: one-click connect (region dialog only where required).
 *  - API-key providers: connect dialog built from the registry's field defs.
 *  - Connected cards: test / disconnect via the row ActionMenu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Mail,
    Magnet,
    Table2,
    Briefcase,
    Globe,
    BookOpen,
    Target,
    BarChart3,
    CreditCard,
    Workflow,
    ShoppingBag,
    PenSquare,
    CalendarClock,
    ExternalLink,
    RefreshCw,
    Unplug,
    Download,
    type LucideIcon,
} from 'lucide-react';
import { Button, Card, Chip, Spinner, FormDialog, ConfirmDialog, ActionMenu, Field, Select, Input } from '@/components/ui-kit';
import {
    INTEGRATION_PROVIDERS,
    type IntegrationProviderDef,
    type IntegrationProviderId,
} from '@/lib/integrations/registry';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'next/navigation';

const PROVIDER_ICONS: Record<IntegrationProviderId, LucideIcon> = {
    mailchimp: Mail,
    hubspot: Magnet,
    airtable: Table2,
    zoho: Briefcase,
    webflow: Globe,
    blogger: BookOpen,
    apollo: Target,
    semrush: BarChart3,
    revenuecat: CreditCard,
    n8n: Workflow,
    shopify: ShoppingBag,
    wordpress: PenSquare,
    calendly: CalendarClock,
    stripe: CreditCard,
};

interface IntegrationConnectionRow {
    _id: string;
    provider: string;
    authType: string;
    brandId: string | null;
    externalAccountName?: string;
    status: 'connected' | 'expired' | 'error';
    lastError?: string | null;
}

interface IntegrationHubProps {
    viewMode?: 'grid' | 'list';
    searchQuery?: string;
    hideTitle?: boolean;
    selectedBrandId?: string;
}

export function IntegrationHub({
    viewMode = 'grid',
    searchQuery = '',
    hideTitle = false,
    selectedBrandId = '',
}: IntegrationHubProps) {
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const [connections, setConnections] = useState<IntegrationConnectionRow[]>([]);
    const [busyProvider, setBusyProvider] = useState<string | null>(null);

    // Connect dialogs
    const [apiKeyProvider, setApiKeyProvider] = useState<IntegrationProviderDef | null>(null);
    const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [regionProvider, setRegionProvider] = useState<IntegrationProviderDef | null>(null);
    const [region, setRegion] = useState('');
    const [connectScope, setConnectScope] = useState<'org' | 'brand'>('org');
    const [disconnectTarget, setDisconnectTarget] = useState<IntegrationConnectionRow | null>(null);

    const fetchConnections = useCallback(async () => {
        try {
            const response = await fetch('/api/v2/integrations');
            if (response.ok) {
                const data = await response.json();
                setConnections(data.connections || []);
            }
        } catch (error) {
            console.error('Failed to fetch integration connections:', error);
        }
    }, []);

    useEffect(() => {
        fetchConnections();
    }, [fetchConnections]);

    // OAuth-callback toast (?success={provider}_connected)
    useEffect(() => {
        const success = searchParams.get('success');
        if (!success?.endsWith('_connected')) return;
        const providerId = success.slice(0, -'_connected'.length);
        const provider = INTEGRATION_PROVIDERS.find((p) => p.id === providerId);
        if (!provider) return; // some other section's callback

        toast({
            title: 'Integration connected',
            description: `Successfully connected ${provider.name}.`,
        });
        fetchConnections();
        window.history.replaceState({}, '', '/settings?tab=connections');
    }, [searchParams, toast, fetchConnections]);

    const connectionsByProvider = useMemo(() => {
        const map = new Map<string, IntegrationConnectionRow[]>();
        for (const connection of connections) {
            const list = map.get(connection.provider) || [];
            list.push(connection);
            map.set(connection.provider, list);
        }
        return map;
    }, [connections]);

    const providers = useMemo(() => {
        const available = INTEGRATION_PROVIDERS.filter((p) => p.status === 'available');
        if (!searchQuery) return available;
        const q = searchQuery.toLowerCase();
        return available.filter(
            (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    /**
     * Hybrid scoping: 'brand' pins the connection to the current brand,
     * 'org' makes it available to every brand. 'default' applies the
     * provider's registry default.
     */
    const resolveScope = (provider: IntegrationProviderDef, override?: 'org' | 'brand') =>
        override ?? provider.defaultScope;

    const oauthUrl = (
        provider: IntegrationProviderDef,
        regionId?: string,
        scopeOverride?: 'org' | 'brand'
    ) => {
        const params = new URLSearchParams();
        if (resolveScope(provider, scopeOverride) === 'brand' && selectedBrandId) {
            params.set('brandId', selectedBrandId);
        }
        if (regionId) params.set('region', regionId);
        const query = params.toString();
        return `/api/v2/integrations/oauth/${provider.id}${query ? `?${query}` : ''}`;
    };

    const handleConnect = (provider: IntegrationProviderDef, scopeOverride?: 'org' | 'brand') => {
        setConnectScope(scopeOverride ?? provider.defaultScope);
        if (provider.authType === 'api_key') {
            setApiKeyValues({});
            setApiKeyError(null);
            setApiKeyProvider(provider);
            return;
        }
        if (provider.regions?.length || provider.textParam) {
            setRegion(provider.regions?.[0]?.id || '');
            setRegionProvider(provider);
            return;
        }
        setBusyProvider(provider.id);
        window.location.href = oauthUrl(provider, undefined, scopeOverride);
    };

    const handleApiKeySubmit = async () => {
        if (!apiKeyProvider) return;
        setApiKeyError(null);

        const response = await fetch('/api/v2/integrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: apiKeyProvider.id,
                brandId: connectScope === 'brand' && selectedBrandId ? selectedBrandId : null,
                credentials: apiKeyValues,
            }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            setApiKeyError(data.error || 'Failed to connect. Check the credentials and try again.');
            throw new Error('connect_failed'); // keep the dialog open
        }

        toast({
            title: 'Integration connected',
            description: `Successfully connected ${apiKeyProvider.name}.`,
        });
        await fetchConnections();
    };

    const handleTest = async (connection: IntegrationConnectionRow) => {
        setBusyProvider(connection.provider);
        try {
            const response = await fetch(`/api/v2/integrations/${connection._id}/test`, {
                method: 'POST',
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.ok) {
                toast({ title: 'Connection healthy', description: 'The integration responded normally.' });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Connection test failed',
                    description: data.error || 'The provider rejected the stored credentials.',
                });
            }
            await fetchConnections();
        } finally {
            setBusyProvider(null);
        }
    };

    const handleImport = async (connection: IntegrationConnectionRow) => {
        setBusyProvider(connection.provider);
        toast({ title: 'Import started', description: 'Pulling data — this can take a minute.' });
        try {
            const response = await fetch(`/api/v2/integrations/${connection._id}/import`, {
                method: 'POST',
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast({
                    variant: 'destructive',
                    title: 'Import failed',
                    description: data.error || 'The provider rejected the request.',
                });
                return;
            }
            toast({
                title: 'Import complete',
                description: `Imported ${data.imported ?? 0} records.`,
            });
        } finally {
            setBusyProvider(null);
        }
    };

    const handleDisconnect = async () => {
        if (!disconnectTarget) return;
        const response = await fetch(`/api/v2/integrations/${disconnectTarget._id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            toast({ variant: 'destructive', title: 'Failed to disconnect' });
            throw new Error('disconnect_failed');
        }
        toast({ title: 'Integration disconnected' });
        await fetchConnections();
    };

    if (providers.length === 0 && searchQuery) {
        return null;
    }

    return (
        <div className="contents">
            {!hideTitle && (
                <div className="col-span-full mb-6 mt-2 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-medium">Marketing & Data Integrations</h3>
                        <p className="text-sm text-muted-foreground">
                            One-click connections to the tools your marketing runs on.
                        </p>
                    </div>
                </div>
            )}

            {providers.map((provider) => {
                const providerConnections = connectionsByProvider.get(provider.id) || [];
                const primary = providerConnections[0];
                const connected = providerConnections.length > 0;
                const errored = primary?.status === 'error' || primary?.status === 'expired';
                const connecting = busyProvider === provider.id;
                const Icon = PROVIDER_ICONS[provider.id];

                const statusChip = connected ? (
                    errored ? (
                        <Chip tone="warn" dot>{primary.status === 'expired' ? 'Expired' : 'Error'}</Chip>
                    ) : (
                        <Chip tone="ok" dot>Connected</Chip>
                    )
                ) : null;

                const supportsImport = provider.id === 'mailchimp' || provider.id === 'hubspot';
                const actionMenu = connected ? (
                    <ActionMenu
                        triggerAriaLabel={`${provider.name} actions`}
                        items={[
                            {
                                label: 'Test connection',
                                icon: RefreshCw,
                                onSelect: () => handleTest(primary),
                            },
                            ...(supportsImport
                                ? [
                                      {
                                          label: 'Import data now',
                                          icon: Download,
                                          onSelect: () => handleImport(primary),
                                      },
                                  ]
                                : []),
                            {
                                label: 'Disconnect',
                                icon: Unplug,
                                danger: true,
                                separatorBefore: true,
                                onSelect: () => setDisconnectTarget(primary),
                            },
                        ]}
                    />
                ) : // One-click OAuth providers get a scope override via the ⋯ menu
                  // (providers with a dialog choose scope inside the dialog).
                  provider.authType !== 'api_key' && !provider.regions?.length && !provider.textParam && selectedBrandId ? (
                    <ActionMenu
                        triggerAriaLabel={`${provider.name} connect options`}
                        items={[
                            {
                                label: 'Connect for all brands',
                                onSelect: () => handleConnect(provider, 'org'),
                            },
                            {
                                label: 'Connect for current brand only',
                                onSelect: () => handleConnect(provider, 'brand'),
                            },
                        ]}
                    />
                ) : null;

                const connectButton = (
                    <Button
                        size="sm"
                        variant={connected ? 'outline' : 'brand'}
                        onClick={() => handleConnect(provider)}
                        disabled={connecting}
                    >
                        {connecting ? (
                            <Spinner size={14} />
                        ) : connected ? (
                            <><ExternalLink className="size-4" />Reconnect</>
                        ) : (
                            'Connect'
                        )}
                    </Button>
                );

                return viewMode === 'list' ? (
                    <Card
                        key={provider.id}
                        className={cn(connected && !errored && 'border-success/30 bg-success-muted/30')}
                        bodyClassName="flex items-center justify-between p-4"
                    >
                        <div className="flex items-center gap-4">
                            <span
                                className={cn(
                                    'grid size-9 place-items-center rounded-lg border border-border',
                                    connected && !errored ? 'bg-success-muted' : 'bg-muted'
                                )}
                            >
                                <Icon className="size-5 text-foreground" />
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{provider.name}</span>
                                    {statusChip}
                                </div>
                                <p className="line-clamp-1 text-xs text-muted-foreground">
                                    {connected && primary.externalAccountName
                                        ? primary.externalAccountName
                                        : provider.description}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {connectButton}
                            {actionMenu}
                        </div>
                    </Card>
                ) : (
                    <Card
                        key={provider.id}
                        lift
                        className={cn('h-full', connected && !errored && 'border-success/40 bg-success-muted/30')}
                        bodyClassName="flex flex-col p-4"
                    >
                        <div className="flex items-start justify-between">
                            <span
                                className={cn(
                                    'grid size-10 place-items-center rounded-full border border-border',
                                    connected && !errored ? 'bg-success-muted' : 'bg-card'
                                )}
                            >
                                <Icon className="size-6 text-foreground" />
                            </span>
                            <div className="flex items-center gap-1.5">
                                {statusChip}
                                {actionMenu}
                            </div>
                        </div>
                        <div className="mt-4 flex-1">
                            <h4 className="mb-1 text-base font-semibold">{provider.name}</h4>
                            <p className="line-clamp-2 text-[13px] text-muted-foreground">
                                {connected && primary.externalAccountName
                                    ? `Connected as ${primary.externalAccountName}`
                                    : provider.description}
                            </p>
                        </div>
                        <div className="mt-4 [&>button]:w-full">{connectButton}</div>
                    </Card>
                );
            })}

            {/* API-key connect dialog */}
            <FormDialog
                open={!!apiKeyProvider}
                onOpenChange={(open) => !open && setApiKeyProvider(null)}
                title={`Connect ${apiKeyProvider?.name ?? ''}`}
                description={apiKeyProvider?.description}
                submitLabel="Connect"
                onSubmit={handleApiKeySubmit}
                submitDisabled={(apiKeyProvider?.apiKeyFields || []).some(
                    (f) => f.required && !apiKeyValues[f.key]?.trim()
                )}
            >
                {(apiKeyProvider?.apiKeyFields || []).map((field) => (
                    <Field
                        key={field.key}
                        label={field.label}
                        required={field.required}
                        hint={field.help}
                        error={field === apiKeyProvider?.apiKeyFields?.[0] ? apiKeyError : undefined}
                    >
                        <Input
                            type={field.type === 'password' ? 'password' : 'text'}
                            placeholder={field.placeholder}
                            value={apiKeyValues[field.key] || ''}
                            onChange={(e) =>
                                setApiKeyValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                        />
                    </Field>
                ))}
                {selectedBrandId ? (
                    <Field label="Available to" hint="Brand-pinned connections take priority over org-wide ones.">
                        <Select
                            value={connectScope}
                            onChange={(v) => setConnectScope(v as 'org' | 'brand')}
                            options={[
                                { value: 'org', label: 'All brands' },
                                { value: 'brand', label: 'Current brand only' },
                            ]}
                        />
                    </Field>
                ) : null}
            </FormDialog>

            {/* Connect parameter dialog: region select (Zoho) or text (Shopify shop) */}
            <FormDialog
                open={!!regionProvider}
                onOpenChange={(open) => !open && setRegionProvider(null)}
                title={`Connect ${regionProvider?.name ?? ''}`}
                description={
                    regionProvider?.textParam
                        ? regionProvider.textParam.help
                        : 'Pick the data center your account is hosted on.'
                }
                submitLabel="Continue"
                submitDisabled={!region.trim()}
                onSubmit={() => {
                    if (!regionProvider) return;
                    window.location.href = oauthUrl(regionProvider, region.trim(), connectScope);
                }}
            >
                {regionProvider?.textParam ? (
                    <Field label={regionProvider.textParam.label} required>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder={regionProvider.textParam.placeholder}
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                            />
                            {regionProvider.textParam.suffix ? (
                                <span className="shrink-0 text-[13px] text-muted-foreground">
                                    {regionProvider.textParam.suffix}
                                </span>
                            ) : null}
                        </div>
                    </Field>
                ) : (
                    <Field label="Region" required>
                        <Select
                            value={region}
                            onChange={setRegion}
                            options={(regionProvider?.regions || []).map((r) => ({
                                value: r.id,
                                label: r.label,
                            }))}
                        />
                    </Field>
                )}
                {selectedBrandId ? (
                    <Field label="Available to" hint="Brand-pinned connections take priority over org-wide ones.">
                        <Select
                            value={connectScope}
                            onChange={(v) => setConnectScope(v as 'org' | 'brand')}
                            options={[
                                { value: 'org', label: 'All brands' },
                                { value: 'brand', label: 'Current brand only' },
                            ]}
                        />
                    </Field>
                ) : null}
            </FormDialog>

            {/* Disconnect confirm */}
            <ConfirmDialog
                open={!!disconnectTarget}
                onOpenChange={(open) => !open && setDisconnectTarget(null)}
                title="Disconnect integration?"
                description="Workflows and syncs using this connection will stop working until you reconnect."
                confirmLabel="Disconnect"
                onConfirm={handleDisconnect}
            />
        </div>
    );
}
