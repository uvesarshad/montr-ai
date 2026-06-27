'use client';

import { Bot, Settings, Cloud, AlertCircle, Link as LinkIcon } from 'lucide-react';
import {
    Button,
    Card,
    Chip,
    Spinner,
    FormDialog,
    ConfirmDialog,
    Field,
    Input,
    EmptyState,
} from '@/components/ui-kit';
import { useEffect, useState, ElementType, useCallback, useMemo } from 'react';
import { Instagram, Youtube, AtSign, Globe } from 'lucide-react';
import { LinkedinLogo, XLogo, FacebookLogo, RedditLogo, TelegramLogo, GoogleBusinessLogo, DribbbleLogo, ThreadsLogo, GoogleDriveLogo } from '@/components/social-icons';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Brand {
    _id: string;
    name: string;
    handle: string;
}

interface TelegramChannel {
    chatId: string;
    title: string;
    type: 'channel' | 'group' | 'supergroup';
    username?: string;
}

interface SocialAccount {
    _id: string;
    platform: string;
    platformUsername: string;
    platformDisplayName?: string;
    avatarUrl?: string;
    isActive: boolean;
    connectionStatus?: 'active' | 'expired' | 'revoked';
    lastError?: string;
    telegramChannels?: TelegramChannel[];
}

interface PlatformConfig {
    id: string;
    platform: string;
    name: string;
    description: string;
    icon: ElementType;
    color: string;
    oauthType: 'redirect' | 'token'; // redirect for OAuth, token for bot tokens
    comingSoon?: boolean; // If true, show "Coming Soon" instead of connect button
}

const supportedPlatforms: PlatformConfig[] = [
    {
        id: 'telegram',
        platform: 'telegram',
        name: 'Telegram',
        description: 'Connect your Telegram bot to send messages to channels and groups.',
        icon: TelegramLogo,
        color: 'text-blue-400',
        oauthType: 'token',
    },
    {
        id: 'x',
        platform: 'x',
        name: 'X (Twitter)',
        description: 'Connect your X account to tweet updates and engage with your followers.',
        icon: XLogo,
        color: 'text-foreground',
        oauthType: 'redirect',
    },
    {
        id: 'linkedin_profile',
        platform: 'linkedin',
        name: 'LinkedIn Profile',
        description: 'Connect your personal profile to share updates with your professional network.',
        icon: LinkedinLogo,
        color: 'text-blue-700',
        oauthType: 'redirect',
    },
    {
        id: 'linkedin_company',
        platform: 'linkedin',
        name: 'LinkedIn Company Page',
        description: 'Connect your company page to share updates with your audience as a business.',
        icon: LinkedinLogo,
        color: 'text-blue-700',
        oauthType: 'redirect',
    },
    {
        id: 'reddit',
        platform: 'reddit',
        name: 'Reddit',
        description: 'Connect your Reddit account to post in communities and track engagement.',
        icon: RedditLogo,
        color: 'text-orange-600',
        oauthType: 'redirect',
        comingSoon: true,
    },
    {
        id: 'instagram',
        platform: 'instagram',
        name: 'Instagram Profile',
        description: 'Connect your Instagram Business or Creator profile to publish posts and view analytics.',
        icon: Instagram,
        color: 'text-pink-600',
        oauthType: 'redirect',
    },
    {
        id: 'facebook',
        platform: 'facebook',
        name: 'Facebook Page',
        description: 'Connect your Facebook Page to share content and manage your community.',
        icon: FacebookLogo,
        color: 'text-blue-600',
        oauthType: 'redirect',
    },
    {
        id: 'youtube',
        platform: 'youtube',
        name: 'YouTube',
        description: 'Connect your YouTube channel to manage videos and view channel performance.',
        icon: Youtube,
        color: 'text-red-600',
        oauthType: 'redirect',
    },
    {
        id: 'google_business',
        platform: 'google_business',
        name: 'Google Business',
        description: 'Connect your Google Business Profile to manage your business presence on Google.',
        icon: GoogleBusinessLogo,
        color: 'text-blue-500',
        oauthType: 'redirect',
    },
    {
        id: 'dribbble',
        platform: 'dribbble',
        name: 'Dribbble',
        description: 'Connect your Dribbble account to showcase your design work.',
        icon: DribbbleLogo,
        color: 'text-pink-500',
        oauthType: 'redirect',
    },
    {
        id: 'threads',
        platform: 'threads',
        name: 'Threads',
        description: 'Connect your Threads account to share text-based updates.',
        icon: ThreadsLogo,
        color: 'text-foreground',
        oauthType: 'redirect',
    },
    {
        id: 'bluesky',
        platform: 'bluesky',
        name: 'Bluesky',
        description: 'Connect your Bluesky account with an app password to publish posts on the AT Protocol.',
        icon: AtSign,
        color: 'text-sky-500',
        oauthType: 'token',
    },
    {
        id: 'mastodon',
        platform: 'mastodon',
        name: 'Mastodon',
        description: 'Connect any Mastodon instance with an access token to publish toots.',
        icon: Globe,
        color: 'text-indigo-500',
        oauthType: 'token',
    },
    // WordPress moved to the Integrations Hub (self-hosted, Application
    // Passwords) — the legacy WordPress.com OAuth route had no callback and
    // never completed a connection.
];

interface SocialConnectionsProps {
    viewMode?: 'grid' | 'list';
    searchQuery?: string;
    hideTitle?: boolean;
    selectedBrandId?: string;
    brands?: Brand[];
    onBrandCreated?: (brand: Brand) => void;
}

export function SocialConnections({
    viewMode = 'grid',
    searchQuery = '',
    hideTitle = false,
    selectedBrandId = '',
    brands = [],
    onBrandCreated: _onBrandCreated
}: SocialConnectionsProps) {
    const { toast } = useToast();

    const [connectedAccounts, setConnectedAccounts] = useState<SocialAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState<string | null>(null);

    // Telegram bot token dialog
    const [showTelegramDialog, setShowTelegramDialog] = useState(false);
    const [telegramBotToken, setTelegramBotToken] = useState('');
    const [isConnectingTelegram, setIsConnectingTelegram] = useState(false);

    // Bluesky app-password dialog
    const [showBlueskyDialog, setShowBlueskyDialog] = useState(false);
    const [blueskyHandle, setBlueskyHandle] = useState('');
    const [blueskyAppPassword, setBlueskyAppPassword] = useState('');
    const [isConnectingBluesky, setIsConnectingBluesky] = useState(false);

    // Mastodon access-token dialog
    const [showMastodonDialog, setShowMastodonDialog] = useState(false);
    const [mastodonInstanceUrl, setMastodonInstanceUrl] = useState('');
    const [mastodonAccessToken, setMastodonAccessToken] = useState('');
    const [isConnectingMastodon, setIsConnectingMastodon] = useState(false);

    // Disconnect confirm
    const [accountToDisconnect, setAccountToDisconnect] = useState<SocialAccount | null>(null);

    // Telegram channel management
    const [_showChannelDialog, setShowChannelDialog] = useState(false);
    const [channelAccountId, setChannelAccountId] = useState<string | null>(null);
    const [newChannelId, setNewChannelId] = useState('');
    const [_isAddingChannel, setIsAddingChannel] = useState(false);

    // Set loading to false when brand is selected
    useEffect(() => {
        if (selectedBrandId) {
            setIsLoading(false);
        }
    }, [selectedBrandId]);

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

    // Handle OAuth callback postMessages from the popup tab
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Security: only accept messages from our own origin
            if (event.origin !== window.location.origin) return;
            if (!event.data || event.data.type !== 'OAUTH_CALLBACK') return;

            const { connected, error } = event.data;

            if (connected) {
                toast({
                    title: 'Account Connected!',
                    description: `Successfully connected your ${connected.toUpperCase()} account.`,
                });
                // Refresh accounts
                if (selectedBrandId) {
                    fetch(`/api/social/brands/${selectedBrandId}/accounts`)
                        .then(res => res.json())
                        .then(data => setConnectedAccounts(data.accounts))
                        .catch(console.error);
                }
            }

            if (error) {
                toast({
                    variant: 'destructive',
                    title: 'Connection Failed',
                    description: decodeURIComponent(error),
                });
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [selectedBrandId, toast]);

    const handleConnect = useCallback((platform: PlatformConfig) => {
        if (!selectedBrandId) {
            toast({ variant: 'destructive', title: 'Please select or create a brand first' });
            return;
        }

        if (platform.oauthType === 'token') {
            // Credential-based connects each have their own dialog.
            if (platform.platform === 'bluesky') {
                setShowBlueskyDialog(true);
            } else if (platform.platform === 'mastodon') {
                setShowMastodonDialog(true);
            } else {
                setShowTelegramDialog(true);
            }
            return;
        }

        // Redirect-based OAuth
        setIsConnecting(platform.id);

        // Pass the specific type if it's a linkedin sub-platform so the backend routing can scope appropriately
        let oauthUrl = `/api/social/oauth/${platform.platform}?brandId=${selectedBrandId}`;
        if (platform.id === 'linkedin_profile') {
            oauthUrl += '&type=profile';
        } else if (platform.id === 'linkedin_company') {
            oauthUrl += '&type=company';
        }

        window.open(oauthUrl, '_blank');
        // We don't want to clear isConnecting immediately since it might take a moment for the new tab to open
        // But we also don't want it stuck forever if the user closes the tab
        setTimeout(() => setIsConnecting(null), 2000);
    }, [selectedBrandId, toast]);

    const handleConnectTelegram = async () => {
        if (!telegramBotToken.trim()) {
            toast({ variant: 'destructive', title: 'Please enter a bot token' });
            return;
        }

        setIsConnectingTelegram(true);
        try {
            const response = await fetch('/api/social/oauth/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    botToken: telegramBotToken,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to connect Telegram');
            }

            toast({
                title: 'Telegram Connected!',
                description: `Successfully connected @${data.bot.username}`,
            });

            setShowTelegramDialog(false);
            setTelegramBotToken('');

            // Refresh accounts
            const accountsRes = await fetch(`/api/social/brands/${selectedBrandId}/accounts`);
            if (accountsRes.ok) {
                const accountsData = await accountsRes.json();
                setConnectedAccounts(accountsData.accounts);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to connect Telegram';
            toast({ variant: 'destructive', title: 'Connection Failed', description: message });
            throw error;
        } finally {
            setIsConnectingTelegram(false);
        }
    };

    const refreshAccounts = useCallback(async () => {
        if (!selectedBrandId) return;
        const accountsRes = await fetch(`/api/social/brands/${selectedBrandId}/accounts`);
        if (accountsRes.ok) {
            const accountsData = await accountsRes.json();
            setConnectedAccounts(accountsData.accounts);
        }
    }, [selectedBrandId]);

    const handleConnectBluesky = async () => {
        if (!blueskyHandle.trim() || !blueskyAppPassword.trim()) {
            toast({ variant: 'destructive', title: 'Please enter your handle and app password' });
            return;
        }

        setIsConnectingBluesky(true);
        try {
            const response = await fetch('/api/social/oauth/bluesky', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    handle: blueskyHandle,
                    appPassword: blueskyAppPassword,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to connect Bluesky');
            }

            toast({ title: 'Bluesky Connected!', description: `Connected @${data.account.handle}` });
            setShowBlueskyDialog(false);
            setBlueskyHandle('');
            setBlueskyAppPassword('');
            await refreshAccounts();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to connect Bluesky';
            toast({ variant: 'destructive', title: 'Connection Failed', description: message });
            throw error;
        } finally {
            setIsConnectingBluesky(false);
        }
    };

    const handleConnectMastodon = async () => {
        if (!mastodonInstanceUrl.trim() || !mastodonAccessToken.trim()) {
            toast({ variant: 'destructive', title: 'Please enter your instance URL and access token' });
            return;
        }

        setIsConnectingMastodon(true);
        try {
            const response = await fetch('/api/social/oauth/mastodon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    instanceUrl: mastodonInstanceUrl,
                    accessToken: mastodonAccessToken,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to connect Mastodon');
            }

            toast({ title: 'Mastodon Connected!', description: `Connected @${data.account.username}` });
            setShowMastodonDialog(false);
            setMastodonInstanceUrl('');
            setMastodonAccessToken('');
            await refreshAccounts();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to connect Mastodon';
            toast({ variant: 'destructive', title: 'Connection Failed', description: message });
            throw error;
        } finally {
            setIsConnectingMastodon(false);
        }
    };

    const handleDisconnect = async (accountId: string) => {
        try {
            const response = await fetch(`/api/social/brands/${selectedBrandId}/accounts/${accountId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setConnectedAccounts(prev => prev.filter(a => a._id !== accountId));
                toast({ title: 'Account disconnected' });
            }
        } catch (_error) {
            toast({ variant: 'destructive', title: 'Failed to disconnect account' });
            throw new Error('disconnect failed');
        }
    };

    const _handleAddChannel = async () => {
        if (!newChannelId.trim() || !channelAccountId) {
            toast({ variant: 'destructive', title: 'Please enter a channel ID, username, or URL' });
            return;
        }

        // Parse input - support URLs like https://t.me/channelname or @channelname or numeric IDs
        let parsedChatId = newChannelId.trim();

        // Handle t.me URLs
        const tmeMatch = parsedChatId.match(/(?:https?:\/\/)?t\.me\/([^\/\s]+)/);
        if (tmeMatch) {
            parsedChatId = '@' + tmeMatch[1];
        }

        // Handle joinchat links (private groups) - these can't be used directly with getChat
        if (parsedChatId.includes('/joinchat/') || parsedChatId.startsWith('+')) {
            toast({
                variant: 'destructive',
                title: 'Private invite links not supported',
                description: 'For private groups, add the bot to the group first, then use the numeric chat ID. Send /id in the group with @userinfobot to get the ID.'
            });
            return;
        }

        setIsAddingChannel(true);
        try {
            const response = await fetch('/api/social/telegram/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: channelAccountId,
                    chatId: parsedChatId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.details || 'Failed to add channel');
            }

            toast({ title: 'Channel added!', description: `Added ${data.channel.title}` });
            setNewChannelId('');

            // Update local state directly with the new channel
            setConnectedAccounts(prev => prev.map(acc => {
                if (acc._id === channelAccountId) {
                    const existingChannels = acc.telegramChannels || [];
                    const channelExists = existingChannels.some(ch => ch.chatId === data.channel.chatId);
                    if (!channelExists) {
                        return {
                            ...acc,
                            telegramChannels: [...existingChannels, data.channel],
                        };
                    }
                }
                return acc;
            }));
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to add channel';
            toast({ variant: 'destructive', title: 'Failed to add channel', description: message });
        } finally {
            setIsAddingChannel(false);
        }
    };

    const _handleRemoveChannel = async (accountId: string, chatId: string) => {
        try {
            const response = await fetch('/api/social/telegram/channels', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, chatId }),
            });

            if (!response.ok) {
                throw new Error('Failed to remove channel');
            }

            toast({ title: 'Channel removed' });

            // Update local state
            setConnectedAccounts(prev => prev.map(acc => {
                if (acc._id === accountId && acc.telegramChannels) {
                    return {
                        ...acc,
                        telegramChannels: acc.telegramChannels.filter(ch => ch.chatId !== chatId),
                    };
                }
                return acc;
            }));
        } catch (_error) {
            toast({ variant: 'destructive', title: 'Failed to remove channel' });
        }
    };

    const getConnectedAccount = (platform: string) => {
        return connectedAccounts.find(a => a.platform === platform);
    };

    const filteredPlatforms = useMemo(() => {
        if (!searchQuery) return supportedPlatforms;
        return supportedPlatforms.filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Spinner size={28} />
            </div>
        );
    }

    if (filteredPlatforms.length === 0 && searchQuery) {
        return null; // Hide section if no results match search
    }

    return (
        <div className="contents">
            {!hideTitle && (
                <div className="col-span-full mb-6 flex items-center justify-between">
                    <h3 className="text-lg font-medium">Social Accounts</h3>
                </div>
            )}

            {brands.length === 0 ? (
                <div className="col-span-full">
                    <EmptyState
                        icon={AlertCircle}
                        title="No Brands Yet"
                        note="Please create a brand in the main settings to start connecting your social media accounts."
                    />
                </div>
            ) : (
                <>
                    {filteredPlatforms.map((platform) => {
                        const connectedAccount = getConnectedAccount(platform.platform);
                        const isConnected = !!connectedAccount;
                        const Icon = platform.icon;

                        if (viewMode === 'list') {
                            return (
                                <Card
                                    key={platform.id}
                                    className={cn(isConnected && "border-brand/40 bg-brand-muted/30")}
                                    bodyClassName="flex items-center justify-between p-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className={cn(
                                            "grid size-9 place-items-center rounded-lg",
                                            isConnected ? "bg-card shadow-sm" : "bg-muted"
                                        )}>
                                            <Icon className={cn("size-5", platform.color)} />
                                        </span>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold">{platform.name}</span>
                                                {isConnected && connectedAccount ? (
                                                    connectedAccount.connectionStatus && connectedAccount.connectionStatus !== 'active' ? (
                                                        <Chip tone="warn" dot>Reconnect needed</Chip>
                                                    ) : (
                                                        <Chip tone="ok" dot>Connected</Chip>
                                                    )
                                                ) : platform.comingSoon ? (
                                                    <Chip tone="gray">Coming Soon</Chip>
                                                ) : null}
                                            </div>
                                            <p className="line-clamp-1 text-xs text-muted-foreground">{platform.description}</p>
                                            {isConnected && connectedAccount && (
                                                connectedAccount.connectionStatus && connectedAccount.connectionStatus !== 'active' ? (
                                                    <span className="mt-0.5 block text-[10px] font-medium text-warning-foreground">
                                                        Token expired — reconnect to keep publishing.
                                                    </span>
                                                ) : (
                                                    <span className="mt-0.5 block text-[10px] font-medium text-success">
                                                        @{connectedAccount.platformUsername}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isConnected ? (
                                            <>
                                                {platform.platform === 'telegram' && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setChannelAccountId(connectedAccount._id);
                                                            setShowChannelDialog(true);
                                                        }}
                                                    >
                                                        Channels ({connectedAccount.telegramChannels?.length || 0})
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-danger hover:bg-danger-muted"
                                                    onClick={() => setAccountToDisconnect(connectedAccount)}
                                                >
                                                    Disconnect
                                                </Button>
                                            </>
                                        ) : platform.comingSoon ? (
                                            <Button size="sm" variant="outline" disabled>Notify Me</Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="brand"
                                                icon={isConnecting === platform.id ? undefined : LinkIcon}
                                                onClick={() => handleConnect(platform)}
                                                disabled={isConnecting === platform.id}
                                            >
                                                {isConnecting === platform.id ? <Spinner size={14} /> : null}
                                                Connect
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            )
                        }

                        return (
                            <Card
                                key={platform.id}
                                lift
                                className={cn("h-full", isConnected && "border-brand/40 bg-brand-muted/30")}
                                bodyClassName="flex flex-col p-4"
                            >
                                <div className="flex items-start justify-between">
                                    <span className={cn(
                                        "grid size-10 place-items-center rounded-full",
                                        isConnected ? "bg-card" : "bg-muted"
                                    )}>
                                        <Icon className={cn("size-6", platform.color)} />
                                    </span>
                                    {isConnected && connectedAccount ? (
                                        connectedAccount.connectionStatus && connectedAccount.connectionStatus !== 'active' ? (
                                            <Chip tone="warn" dot>Reconnect needed</Chip>
                                        ) : (
                                            <Chip tone="ok" dot>Connected</Chip>
                                        )
                                    ) : (
                                        <Chip tone="gray">Not Connected</Chip>
                                    )}
                                </div>
                                <div className="mt-4 flex-1">
                                    <h4 className="mb-2 text-base font-semibold">{platform.name}</h4>
                                    <p className="line-clamp-2 text-[13px] text-muted-foreground">
                                        {platform.description}
                                    </p>
                                    {isConnected && connectedAccount && (
                                        connectedAccount.connectionStatus && connectedAccount.connectionStatus !== 'active' ? (
                                            <div className="mt-4 flex items-center rounded-md border border-warning/40 bg-warning-muted/40 p-2 text-sm font-medium text-warning-foreground">
                                                <AlertCircle className="mr-2 size-4" />
                                                Token expired — reconnect to keep publishing.
                                            </div>
                                        ) : (
                                            <div className="mt-4 flex items-center rounded-md border border-border bg-muted/40 p-2 text-sm font-medium text-foreground">
                                                <LinkIcon className="mr-2 size-4 text-success" />
                                                @{connectedAccount.platformUsername}
                                            </div>
                                        )
                                    )}
                                </div>
                                <div className="mt-4">
                                    {isConnected ? (
                                        <div className="flex w-full gap-2">
                                            {platform.platform === 'telegram' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full"
                                                    icon={Settings}
                                                    onClick={() => {
                                                        setChannelAccountId(connectedAccount._id);
                                                        setShowChannelDialog(true);
                                                    }}
                                                >
                                                    Channels ({connectedAccount.telegramChannels?.length || 0})
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full text-danger hover:bg-danger-muted"
                                                onClick={() => setAccountToDisconnect(connectedAccount)}
                                            >
                                                Disconnect
                                            </Button>
                                        </div>
                                    ) : platform.comingSoon ? (
                                        <Button className="w-full" variant="outline" disabled>
                                            Coming Soon
                                        </Button>
                                    ) : (
                                        <Button
                                            className="w-full"
                                            variant="brand"
                                            icon={isConnecting === platform.id ? undefined : LinkIcon}
                                            onClick={() => handleConnect(platform)}
                                            disabled={isConnecting === platform.id}
                                        >
                                            {isConnecting === platform.id ? <Spinner size={14} /> : null}
                                            Connect {platform.name}
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                    {(!searchQuery || "storage cloud google drive".toLowerCase().includes(searchQuery.toLowerCase())) && (
                        <>
                            {/* Default Storage Card */}
                            {(!searchQuery || "cloud storage".toLowerCase().includes(searchQuery.toLowerCase())) && (
                                viewMode === 'list' ? (
                                    <Card className="border-brand/40 bg-brand-muted/30" bodyClassName="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-4">
                                            <span className="grid size-9 place-items-center rounded-lg bg-card shadow-sm">
                                                <Cloud className="size-5 text-info" />
                                            </span>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold">Cloud Storage</span>
                                                    <Chip tone="ok">Default</Chip>
                                                </div>
                                                <p className="line-clamp-1 text-xs text-muted-foreground">Secure cloud infrastructure (AWS/Wasabi).</p>
                                            </div>
                                        </div>
                                        <Chip tone="ok" dot>Active</Chip>
                                    </Card>
                                ) : (
                                    <Card className="h-full border-brand/40 bg-brand-muted/30" bodyClassName="flex flex-col p-4">
                                        <div className="flex items-start justify-between">
                                            <span className="grid size-10 place-items-center rounded-full bg-card">
                                                <Cloud className="size-6 text-info" />
                                            </span>
                                            <Chip tone="ok">Default</Chip>
                                        </div>
                                        <div className="mt-4 flex-1">
                                            <h4 className="mb-2 text-base font-semibold">Cloud Storage</h4>
                                            <p className="line-clamp-2 text-[13px] text-muted-foreground">
                                                Your files are stored securely in our cloud infrastructure (AWS/Wasabi).
                                            </p>
                                            <div className="mt-4 flex items-center rounded-md border border-border bg-muted/40 p-2 text-sm font-medium text-foreground">
                                                <Cloud className="mr-2 size-4 text-success" />
                                                Active by default
                                            </div>
                                        </div>
                                    </Card>
                                )
                            )}

                            {/* Google Drive Card */}
                            {(!searchQuery || "google drive".toLowerCase().includes(searchQuery.toLowerCase())) && (
                                viewMode === 'list' ? (
                                    <Card bodyClassName="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-4">
                                            <span className="grid size-9 place-items-center rounded-lg bg-muted">
                                                <GoogleDriveLogo className="size-5 text-yellow-500" />
                                            </span>
                                            <div>
                                                <span className="text-sm font-semibold">Google Drive</span>
                                                <p className="line-clamp-1 text-xs text-muted-foreground">Connect your Google Drive for media assets.</p>
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="brand"
                                            icon={LinkIcon}
                                            onClick={() => {
                                                if (!selectedBrandId) {
                                                    toast({ variant: 'destructive', title: 'Please select a brand first' });
                                                    return;
                                                }
                                                window.open(`/api/social/oauth/google-drive?brandId=${selectedBrandId}`, '_blank');
                                            }}
                                        >
                                            Connect
                                        </Button>
                                    </Card>
                                ) : (
                                    <Card lift className="h-full" bodyClassName="flex flex-col p-4">
                                        <div className="flex items-start justify-between">
                                            <span className="grid size-10 place-items-center rounded-full bg-muted">
                                                <GoogleDriveLogo className="size-6 text-yellow-500" />
                                            </span>
                                            <Chip tone="gray">Optional</Chip>
                                        </div>
                                        <div className="mt-4 flex-1">
                                            <h4 className="mb-2 text-base font-semibold">Google Drive</h4>
                                            <p className="line-clamp-2 text-[13px] text-muted-foreground">
                                                Connect your Google Drive to use your personal storage for media assets.
                                            </p>
                                        </div>
                                        <Button
                                            className="mt-4 w-full"
                                            variant="brand"
                                            icon={LinkIcon}
                                            onClick={() => {
                                                if (!selectedBrandId) {
                                                    toast({ variant: 'destructive', title: 'Please select a brand first' });
                                                    return;
                                                }
                                                window.open(`/api/social/oauth/google-drive?brandId=${selectedBrandId}`, '_blank');
                                            }}
                                        >
                                            Connect Google Drive
                                        </Button>
                                    </Card>
                                )
                            )}
                        </>
                    )}
                </>
            )}

            {/* Telegram Bot Token Dialog */}
            <FormDialog
                open={showTelegramDialog}
                onOpenChange={setShowTelegramDialog}
                title="Connect Telegram Bot"
                description="Enter your Telegram bot token from @BotFather to connect your bot."
                icon={Bot}
                submitLabel="Connect Bot"
                submitting={isConnectingTelegram}
                onSubmit={handleConnectTelegram}
            >
                <Field
                    label="Bot Token"
                    htmlFor="bot-token"
                    hint={<>Get this from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-brand-strong hover:underline">@BotFather</a> on Telegram</>}
                >
                    <Input
                        id="bot-token"
                        type="password"
                        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        value={telegramBotToken}
                        onChange={e => setTelegramBotToken(e.target.value)}
                    />
                </Field>
            </FormDialog>

            {/* Bluesky App Password Dialog */}
            <FormDialog
                open={showBlueskyDialog}
                onOpenChange={setShowBlueskyDialog}
                title="Connect Bluesky"
                description="Enter your handle and an app password to publish to Bluesky."
                icon={AtSign}
                submitLabel="Connect Bluesky"
                submitting={isConnectingBluesky}
                onSubmit={handleConnectBluesky}
            >
                <Field label="Handle" htmlFor="bsky-handle" hint="e.g. yourname.bsky.social">
                    <Input
                        id="bsky-handle"
                        placeholder="yourname.bsky.social"
                        value={blueskyHandle}
                        onChange={e => setBlueskyHandle(e.target.value)}
                    />
                </Field>
                <Field
                    label="App Password"
                    htmlFor="bsky-app-password"
                    hint={<>Create one at <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer" className="text-brand-strong hover:underline">Settings → App Passwords</a></>}
                >
                    <Input
                        id="bsky-app-password"
                        type="password"
                        placeholder="xxxx-xxxx-xxxx-xxxx"
                        value={blueskyAppPassword}
                        onChange={e => setBlueskyAppPassword(e.target.value)}
                    />
                </Field>
            </FormDialog>

            {/* Mastodon Access Token Dialog */}
            <FormDialog
                open={showMastodonDialog}
                onOpenChange={setShowMastodonDialog}
                title="Connect Mastodon"
                description="Enter your instance URL and an access token to publish toots."
                icon={Globe}
                submitLabel="Connect Mastodon"
                submitting={isConnectingMastodon}
                onSubmit={handleConnectMastodon}
            >
                <Field label="Instance URL" htmlFor="mastodon-instance" hint="e.g. https://mastodon.social">
                    <Input
                        id="mastodon-instance"
                        placeholder="https://mastodon.social"
                        value={mastodonInstanceUrl}
                        onChange={e => setMastodonInstanceUrl(e.target.value)}
                    />
                </Field>
                <Field
                    label="Access Token"
                    htmlFor="mastodon-token"
                    hint="Create an application in your instance Settings → Development, then copy its access token."
                >
                    <Input
                        id="mastodon-token"
                        type="password"
                        placeholder="Your access token"
                        value={mastodonAccessToken}
                        onChange={e => setMastodonAccessToken(e.target.value)}
                    />
                </Field>
            </FormDialog>

            {/* Disconnect confirm */}
            <ConfirmDialog
                open={!!accountToDisconnect}
                onOpenChange={(o) => { if (!o) setAccountToDisconnect(null); }}
                title="Disconnect this account?"
                description={accountToDisconnect ? `@${accountToDisconnect.platformUsername} will be disconnected.` : undefined}
                confirmLabel="Disconnect"
                onConfirm={() => { if (accountToDisconnect) return handleDisconnect(accountToDisconnect._id); }}
            />
        </div>
    );
}
