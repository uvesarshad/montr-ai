'use client';

import { useEffect, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Button, Card, Spinner } from '@/components/ui-kit';

interface MetaAsset {
    id: string;
    platform: 'facebook' | 'instagram';
    displayName: string;
    username: string;
    avatarUrl?: string;
    pageId: string;
    pageName: string;
}

function MetaAssetSelector({ platform }: { platform: 'facebook' | 'instagram' }) {
    const [assets, setAssets] = useState<MetaAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAssets() {
            try {
                const response = await fetch(`/api/social/oauth/meta/assets?platform=${platform}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load accounts');
                }

                setAssets(data.assets || []);
            } catch (fetchError) {
                const message = fetchError instanceof Error ? fetchError.message : 'Failed to load accounts';
                setError(message);
            } finally {
                setLoading(false);
            }
        }

        loadAssets();
    }, [platform]);

    async function handleSelect(assetId: string) {
        setSubmittingId(assetId);
        setError(null);

        try {
            const response = await fetch('/api/social/oauth/meta/select', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ platform, assetId }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to connect account');
            }

            window.location.href = `/social/oauth-callback?connected=${encodeURIComponent(data.connected)}`;
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Failed to connect account';
            setError(message);
            setSubmittingId(null);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8">
                    <Spinner size={64} className="mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">Loading Accounts...</h1>
                    <p className="text-muted-foreground">Fetching your connectable {platform} assets.</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8 max-w-md">
                    <XCircle className="size-16 text-destructive mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">Selection Failed</h1>
                    <p className="text-muted-foreground">{error}</p>
                </div>
            </div>
        );
    }

    if (assets.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8 max-w-md">
                    <XCircle className="size-16 text-destructive mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">No Connectable Accounts</h1>
                    <p className="text-muted-foreground">
                        {platform === 'instagram'
                            ? 'No Instagram Business or Creator account linked to your Facebook Pages was found.'
                            : 'No Facebook Pages with posting access were found for this Meta account.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="mx-auto max-w-2xl space-y-4">
                <div className="text-center space-y-2 pb-2">
                    <h1 className="text-2xl font-bold text-foreground">
                        Select {platform === 'facebook' ? 'a Facebook Page' : 'an Instagram Account'}
                    </h1>
                    <p className="text-muted-foreground">
                        Choose the {platform === 'facebook' ? 'Page' : 'profile'} you want to connect to this brand.
                    </p>
                </div>

                {assets.map((asset) => (
                    <Card key={asset.id}>
                        <div className="flex items-center justify-between gap-4 p-4">
                            <div className="flex items-center gap-3 min-w-0">
                                {asset.avatarUrl ? (
                                    <Image
                                        src={asset.avatarUrl}
                                        alt={asset.displayName}
                                        width={44}
                                        height={44}
                                        className="rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="size-11 rounded-full bg-muted" />
                                )}
                                <div className="min-w-0">
                                    <p className="font-medium text-foreground truncate">{asset.displayName}</p>
                                    <p className="text-sm text-muted-foreground truncate">@{asset.username}</p>
                                    {platform === 'instagram' && (
                                        <p className="text-xs text-muted-foreground truncate">
                                            Linked Page: {asset.pageName}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="brand"
                                size="sm"
                                icon={submittingId === asset.id ? Loader2 : undefined}
                                onClick={() => handleSelect(asset.id)}
                                disabled={submittingId !== null}
                            >
                                {submittingId === asset.id ? 'Connecting…' : 'Connect'}
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}

interface ExternalAccountAsset {
    id: string;
    name: string;
    currencyCode?: string;
    timezone?: string;
    isManager?: boolean;
    isTestAccount?: boolean;
    businessName?: string;
    accountStatus?: number;
    detail?: string; // GA4: account name · GSC: permission level
}

type ExternalAccountPlatform = 'google_ads' | 'meta_ads' | 'ga4' | 'search_console';

const EXTERNAL_ACCOUNT_PICKERS: Record<ExternalAccountPlatform, {
    label: string;
    noun: string;
    assetsUrl: string;
    selectUrl: string;
}> = {
    google_ads: {
        label: 'Google Ads',
        noun: 'ad account',
        assetsUrl: '/api/ads/oauth/assets?platform=google_ads',
        selectUrl: '/api/ads/oauth/select',
    },
    meta_ads: {
        label: 'Meta Ads',
        noun: 'ad account',
        assetsUrl: '/api/ads/oauth/assets?platform=meta_ads',
        selectUrl: '/api/ads/oauth/select',
    },
    ga4: {
        label: 'Google Analytics',
        noun: 'property',
        assetsUrl: '/api/analytics/oauth/assets?platform=ga4',
        selectUrl: '/api/analytics/oauth/select',
    },
    search_console: {
        label: 'Search Console',
        noun: 'site',
        assetsUrl: '/api/analytics/oauth/assets?platform=search_console',
        selectUrl: '/api/analytics/oauth/select',
    },
};

function ExternalAccountSelector({ platform }: { platform: ExternalAccountPlatform }) {
    const [assets, setAssets] = useState<ExternalAccountAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const picker = EXTERNAL_ACCOUNT_PICKERS[platform];

    useEffect(() => {
        async function loadAssets() {
            try {
                const response = await fetch(picker.assetsUrl);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Failed to load ${picker.noun}s`);
                }

                setAssets(data.assets || []);
            } catch (fetchError) {
                const message = fetchError instanceof Error ? fetchError.message : `Failed to load ${picker.noun}s`;
                setError(message);
            } finally {
                setLoading(false);
            }
        }

        loadAssets();
    }, [platform, picker]);

    async function handleSelect(assetId: string) {
        setSubmittingId(assetId);
        setError(null);

        try {
            const response = await fetch(picker.selectUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ platform, assetId }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `Failed to connect ${picker.noun}`);
            }

            window.location.href = `/social/oauth-callback?connected=${encodeURIComponent(data.connected)}`;
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : `Failed to connect ${picker.noun}`;
            setError(message);
            setSubmittingId(null);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8">
                    <Spinner size={64} className="mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">Loading Accounts...</h1>
                    <p className="text-muted-foreground">Fetching your connectable {picker.label} {picker.noun}s.</p>
                </div>
            </div>
        );
    }

    if (error && assets.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8 max-w-md">
                    <XCircle className="size-16 text-destructive mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">Selection Failed</h1>
                    <p className="text-muted-foreground">{error}</p>
                </div>
            </div>
        );
    }

    if (assets.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8 max-w-md">
                    <XCircle className="size-16 text-destructive mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">No Connectable Accounts</h1>
                    <p className="text-muted-foreground">
                        No {picker.label} {picker.noun}s were found for the account you authorized.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="mx-auto max-w-2xl space-y-4">
                <div className="text-center space-y-2 pb-2">
                    <h1 className="text-2xl font-bold text-foreground">
                        Select a {picker.label} {picker.noun}
                    </h1>
                    <p className="text-muted-foreground">
                        Choose the {picker.noun} you want to connect to this brand.
                    </p>
                </div>

                {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
                )}

                {assets.map((asset) => {
                    const isBlocked = platform === 'google_ads' && asset.isManager;
                    const secondary = [
                        asset.id !== asset.name ? asset.id : null,
                        asset.currencyCode,
                        asset.timezone,
                        asset.detail,
                    ].filter(Boolean).join(' · ');
                    return (
                        <Card key={asset.id}>
                            <div className="flex items-center justify-between gap-4 p-4">
                                <div className="min-w-0">
                                    <p className="font-medium text-foreground truncate">{asset.name}</p>
                                    {secondary && (
                                        <p className="text-sm text-muted-foreground truncate">{secondary}</p>
                                    )}
                                    {asset.businessName && (
                                        <p className="text-xs text-muted-foreground truncate">
                                            Business: {asset.businessName}
                                        </p>
                                    )}
                                    {isBlocked && (
                                        <p className="text-xs text-muted-foreground truncate">
                                            Manager (MCC) account — connect a client account instead
                                        </p>
                                    )}
                                    {asset.isTestAccount && (
                                        <p className="text-xs text-muted-foreground truncate">Test account</p>
                                    )}
                                </div>
                                <Button
                                    variant="brand"
                                    size="sm"
                                    icon={submittingId === asset.id ? Loader2 : undefined}
                                    onClick={() => handleSelect(asset.id)}
                                    disabled={submittingId !== null || isBlocked}
                                >
                                    {submittingId === asset.id ? 'Connecting…' : 'Connect'}
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

function OAuthCallbackContent() {
    const searchParams = useSearchParams();
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    const metaMode = searchParams.get('meta');
    const adsMode = searchParams.get('ads');
    const analyticsMode = searchParams.get('analytics');
    const platform = searchParams.get('platform');
    const selectedPlatform = platform === 'facebook' || platform === 'instagram' ? platform : null;
    const selectedAdPlatform =
        (adsMode === 'select' && (platform === 'google_ads' || platform === 'meta_ads')) ||
        (analyticsMode === 'select' && (platform === 'ga4' || platform === 'search_console'))
            ? (platform as ExternalAccountPlatform)
            : null;
    const showMetaSelector = metaMode === 'select' && selectedPlatform !== null;
    const showAdsSelector = selectedAdPlatform !== null;

    useEffect(() => {
        if (showMetaSelector || showAdsSelector) {
            return;
        }

        // Send message to parent window (the Settings tab that opened us)
        let timer: ReturnType<typeof setTimeout>;
        if (window.opener) {
            window.opener.postMessage(
                {
                    type: 'OAUTH_CALLBACK',
                    connected: connected || null,
                    error: error || null,
                },
                window.location.origin
            );
            // Close this popup tab after a short delay
            timer = setTimeout(() => window.close(), 1500);
        } else {
            // If no opener (user navigated directly), redirect to settings
            timer = setTimeout(() => {
                window.location.href = '/settings?tab=connections' +
                    (connected ? `&connected=${connected}` : '') +
                    (error ? `&error=${encodeURIComponent(error)}` : '');
            }, 2000);
        }
        return () => clearTimeout(timer);
    }, [connected, error, showMetaSelector, showAdsSelector]);

    if (showMetaSelector) {
        return <MetaAssetSelector platform={selectedPlatform} />;
    }

    if (selectedAdPlatform) {
        return <ExternalAccountSelector platform={selectedAdPlatform} />;
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8">
                    <XCircle className="size-16 text-destructive mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">Connection Failed</h1>
                    <p className="text-muted-foreground max-w-md">{decodeURIComponent(error)}</p>
                    <p className="text-sm text-muted-foreground">This window will close automatically...</p>
                </div>
            </div>
        );
    }

    if (connected) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4 p-8">
                    <CheckCircle className="size-16 text-green-500 mx-auto" />
                    <h1 className="text-2xl font-bold text-foreground">Connected Successfully!</h1>
                    <p className="text-muted-foreground">
                        Your <span className="font-semibold capitalize">{connected.replace(/_/g, ' ')}</span> account has been connected.
                    </p>
                    <p className="text-sm text-muted-foreground">This window will close automatically...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center space-y-4 p-8">
                <Spinner size={64} className="mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">Processing...</h1>
                <p className="text-muted-foreground">Please wait while we complete your connection.</p>
            </div>
        </div>
    );
}

export default function OAuthCallbackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Spinner size={32} />
            </div>
        }>
            <OAuthCallbackContent />
        </Suspense>
    );
}
