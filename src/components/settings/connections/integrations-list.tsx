'use client';

import { Slack, ExternalLink } from "lucide-react";
import { Button, Card, Chip, Spinner } from "@/components/ui-kit";
import { NotionLogo, DiscordLogo, PinterestLogo } from "@/components/social-icons";
import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "next/navigation";

interface IntegrationsListProps {
    viewMode?: 'grid' | 'list';
    searchQuery?: string;
    hideTitle?: boolean;
    selectedBrandId?: string;
    brands?: Brand[];
}

interface Brand {
    _id: string;
    name: string;
}

interface SocialAccount {
    _id: string;
    platform: string;
    isActive: boolean;
}

export function IntegrationsList({
    viewMode = 'grid',
    searchQuery = '',
    hideTitle = false,
    selectedBrandId = '',
    brands: _brands = []
}: IntegrationsListProps) {
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const [connectedAccounts, setConnectedAccounts] = useState<SocialAccount[]>([]);
    const [isConnecting, setIsConnecting] = useState<string | null>(null);

    const integrations = [
        {
            id: "slack",
            name: "Slack",
            description: "Connect Slack to receive notifications and manage messages directly.",
            icon: Slack,
            color: "text-[#4A154B]",
        },
        {
            id: "notion",
            name: "Notion",
            description: "Sync your Notion pages and databases with your workspace.",
            icon: NotionLogo,
            color: "text-foreground",
        },
        {
            id: "discord",
            name: "Discord",
            description: "Manage your Discord community and automate roles and messages.",
            icon: DiscordLogo,
            color: "text-[#5865F2]",
        },
        {
            id: "pinterest",
            name: "Pinterest",
            description: "Schedule pins and analyze your board performance.",
            icon: PinterestLogo,
            color: "text-[#E60023]",
        },
        // Shopify moved to the Integrations Hub (IntegrationHub component) —
        // the legacy /api/social/oauth/shopify route has no callback and is dead.
    ];

    // Fetch accounts when brand changes
    useEffect(() => {
        async function fetchAccounts() {
            if (!selectedBrandId) return;

            try {
                const response = await fetch(`/api/social/brands/${selectedBrandId}/accounts`);
                if (response.ok) {
                    const data = await response.json();
                    setConnectedAccounts(data.accounts);
                }
            } catch (error) {
                console.error('Failed to fetch accounts:', error);
            }
        }
        fetchAccounts();
    }, [selectedBrandId]);

    // Handle OAuth callback messages
    useEffect(() => {
        const _connected = searchParams.get('connected');
        const error = searchParams.get('error');
        const success = searchParams.get('success');

        if (success && ['slack_connected', 'notion_connected', 'discord_connected', 'pinterest_connected', 'gmail_connected', 'outlook_connected'].includes(success)) {
            const isEmailAccount = success === 'gmail_connected' || success === 'outlook_connected';
            const connectedLabel = success.replace('_connected', '');
            toast({
                title: isEmailAccount ? 'Email account connected' : 'Integration Connected',
                description: `Successfully connected ${connectedLabel.charAt(0).toUpperCase() + connectedLabel.slice(1)}.`,
            });
            // Refresh accounts
            if (selectedBrandId) {
                fetch(`/api/social/brands/${selectedBrandId}/accounts`)
                    .then(res => res.json())
                    .then(data => setConnectedAccounts(data.accounts));
            }
            // Clear URL params
            window.history.replaceState({}, '', '/settings?tab=connections');
        }

        if (error) {
            // Error toast intentionally handled by SocialConnections to avoid duplicates.
        }
    }, [searchParams, selectedBrandId, toast]);


    const handleConnect = (integrationId: string) => {
        if (!selectedBrandId) {
            toast({ variant: 'destructive', title: 'Please select a brand first' });
            return;
        }

        setIsConnecting(integrationId);
        // Open in new tab/window for auth
        window.open(`/api/social/oauth/${integrationId}?brandId=${selectedBrandId}`, '_blank');
    };

    const isConnected = (integrationId: string) => {
        return connectedAccounts.some(acc => acc.platform === integrationId && acc.isActive);
    };

    const filteredIntegrations = useMemo(() => {
        if (!searchQuery) return integrations;
        const q = searchQuery.toLowerCase();
        return integrations.filter(i =>
            i.name.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q)
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    if (filteredIntegrations.length === 0 && searchQuery) {
        return null;
    }

    return (
        <div className="contents">
            {!hideTitle && (
                <div className="col-span-full mb-6 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-medium">Integrations & Apps</h3>
                        <p className="text-sm text-muted-foreground">
                            Connect your favorite tools to MontrAI.
                        </p>
                    </div>
                </div>
            )}

            {filteredIntegrations.map((integration) => {
                const connected = isConnected(integration.id);
                const connecting = isConnecting === integration.id;
                const Icon = integration.icon;

                return viewMode === 'list' ? (
                    <Card
                        key={integration.id}
                        className={cn(connected && "border-success/30 bg-success-muted/30")}
                        bodyClassName="flex items-center justify-between p-4"
                    >
                        <div className="flex items-center gap-4">
                            <span className={cn(
                                "grid size-9 place-items-center rounded-lg border border-border",
                                connected ? "bg-success-muted" : "bg-muted"
                            )}>
                                <Icon className={cn("size-5", integration.color)} />
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{integration.name}</span>
                                    {connected && <Chip tone="ok" dot>Connected</Chip>}
                                </div>
                                <p className="line-clamp-1 text-xs text-muted-foreground">{integration.description}</p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant={connected ? "outline" : "brand"}
                            className={cn("w-24", connected && "text-danger hover:bg-danger-muted")}
                            onClick={() => handleConnect(integration.id)}
                            disabled={connecting || !selectedBrandId}
                        >
                            {connecting ? <Spinner size={14} /> : connected ? "Disconnect" : "Connect"}
                        </Button>
                    </Card>
                ) : (
                    <Card
                        key={integration.id}
                        lift
                        className={cn("h-full", connected && "border-success/40 bg-success-muted/30")}
                        bodyClassName="flex flex-col p-4"
                    >
                        <div className="flex items-start justify-between">
                            <span className={cn(
                                "grid size-10 place-items-center rounded-full border border-border",
                                connected ? "bg-success-muted" : "bg-card"
                            )}>
                                <Icon className={cn("size-6", integration.color)} />
                            </span>
                            {connected && <Chip tone="ok" dot>Connected</Chip>}
                        </div>
                        <div className="mt-4 flex-1">
                            <h4 className="mb-1 text-base font-semibold">{integration.name}</h4>
                            <p className="line-clamp-2 text-[13px] text-muted-foreground">
                                {integration.description}
                            </p>
                        </div>
                        <Button
                            className="mt-4 w-full"
                            variant={connected ? "outline" : "brand"}
                            onClick={() => handleConnect(integration.id)}
                            disabled={connecting || !selectedBrandId}
                        >
                            {connecting ? (
                                <><Spinner size={14} />Connecting...</>
                            ) : connected ? (
                                <><ExternalLink className="size-4" />Manage / Disconnect</>
                            ) : (
                                <><Icon className="size-4" />Connect {integration.name}</>
                            )}
                        </Button>
                    </Card>
                );
            })}
        </div>
    );
}
