'use client';

/**
 * Doc-editor control for Notion sync (Phase 1 of the integrations expansion).
 *
 * Unlinked: "Sync with Notion" → pick a page via NotionBrowser → choose a
 * direction → POST the link (runs the initial sync).
 * Linked: status button → manage dialog (direction, sync-now, unlink).
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { Button, Chip, Spinner, FormDialog, ConfirmDialog, Field, Select } from '@/components/ui-kit';
import { NotionBrowser } from '@/components/integrations/notion-browser';
import { NotionLogo } from '@/components/social-icons';
import { useToast } from '@/hooks/use-toast';

type SyncDirection = 'pull' | 'push' | 'two_way';

interface SyncLink {
    _id: string;
    externalId: string;
    externalUrl?: string;
    externalTitle?: string;
    direction: SyncDirection;
    lastSyncedAt?: string | null;
    syncStatus: 'idle' | 'syncing' | 'error';
    lastError?: string | null;
}

const DIRECTION_OPTIONS = [
    { value: 'pull', label: 'Pull — Notion is the source of truth' },
    { value: 'push', label: 'Push — this doc is the source of truth' },
    { value: 'two_way', label: 'Two-way — last edit wins' },
];

interface NotionSyncControlProps {
    docId: string;
    /** Called after a sync that pulled Notion content into the doc. */
    onContentPulled?: () => void;
}

export function NotionSyncControl({ docId, onContentPulled }: NotionSyncControlProps) {
    const { toast } = useToast();

    const [link, setLink] = useState<SyncLink | null>(null);
    const [loaded, setLoaded] = useState(false);

    // Link-creation flow
    const [pendingPage, setPendingPage] = useState<{
        pageId: string;
        title: string;
        brandId: string;
    } | null>(null);
    const [direction, setDirection] = useState<SyncDirection>('pull');

    // Manage flow
    const [manageOpen, setManageOpen] = useState(false);
    const [unlinkOpen, setUnlinkOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const fetchLink = useCallback(async () => {
        try {
            const response = await fetch(`/api/v2/documents/${docId}/notion-sync`);
            if (response.ok) {
                const data = await response.json();
                setLink(data.link);
            }
        } catch (error) {
            console.error('Failed to fetch notion sync link:', error);
        } finally {
            setLoaded(true);
        }
    }, [docId]);

    useEffect(() => {
        fetchLink();
    }, [fetchLink]);

    const handleCreateLink = async () => {
        if (!pendingPage) return;
        const response = await fetch(`/api/v2/documents/${docId}/notion-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                brandId: pendingPage.brandId,
                notionPageId: pendingPage.pageId,
                pageTitle: pendingPage.title,
                direction,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            toast({
                variant: 'destructive',
                title: 'Could not link Notion page',
                description: data.error || 'Something went wrong.',
            });
            throw new Error('link_failed');
        }

        setLink(data.link);
        toast({
            title: 'Notion sync enabled',
            description:
                direction === 'push'
                    ? 'The doc was pushed to the Notion page.'
                    : 'Content was pulled from the Notion page.',
        });
        if (direction !== 'push') {
            onContentPulled?.();
        }
    };

    const handleSyncNow = async () => {
        if (!link) return;
        setSyncing(true);
        try {
            const response = await fetch(`/api/v2/documents/${docId}/notion-sync`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncNow: true }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.result?.action === 'error') {
                toast({
                    variant: 'destructive',
                    title: 'Sync failed',
                    description: data.result?.error || data.error || 'Something went wrong.',
                });
                return;
            }
            setLink(data.link);
            const action = data.result?.action;
            toast({
                title:
                    action === 'pulled'
                        ? 'Pulled latest from Notion'
                        : action === 'pushed'
                          ? 'Pushed doc to Notion'
                          : 'Already in sync',
                description: data.result?.conflict
                    ? 'Both sides had changes — the newer edit won (a version snapshot was saved).'
                    : undefined,
            });
            if (action === 'pulled') {
                onContentPulled?.();
            }
        } finally {
            setSyncing(false);
        }
    };

    const handleDirectionChange = async (next: string) => {
        if (!link) return;
        const response = await fetch(`/api/v2/documents/${docId}/notion-sync`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: next }),
        });
        if (response.ok) {
            const data = await response.json();
            setLink(data.link);
        }
    };

    const handleUnlink = async () => {
        const response = await fetch(`/api/v2/documents/${docId}/notion-sync`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            toast({ variant: 'destructive', title: 'Failed to unlink' });
            throw new Error('unlink_failed');
        }
        setLink(null);
        setManageOpen(false);
        toast({ title: 'Notion sync removed', description: 'The document content was kept.' });
    };

    if (!loaded) return null;

    // ── Unlinked: page picker entry point ────────────────────────────
    if (!link) {
        return (
            <>
                <NotionBrowser
                    onSelectPage={(pageId, title, brandId) => {
                        setDirection('pull');
                        setPendingPage({ pageId, title, brandId });
                    }}
                >
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                        <NotionLogo className="size-4" />
                        <span className="hidden sm:inline">Sync with Notion</span>
                    </Button>
                </NotionBrowser>

                <FormDialog
                    open={!!pendingPage}
                    onOpenChange={(open) => !open && setPendingPage(null)}
                    title="Sync with Notion"
                    description={
                        pendingPage
                            ? `Link this doc to “${pendingPage.title}” and keep them in sync.`
                            : undefined
                    }
                    submitLabel="Link & sync"
                    onSubmit={handleCreateLink}
                >
                    <Field
                        label="Sync direction"
                        hint={
                            direction === 'push'
                                ? 'The Notion page content will be replaced by this doc.'
                                : 'This doc’s content will be replaced by the Notion page.'
                        }
                    >
                        <Select
                            value={direction}
                            onChange={(v) => setDirection(v as SyncDirection)}
                            options={DIRECTION_OPTIONS}
                        />
                    </Field>
                </FormDialog>
            </>
        );
    }

    // ── Linked: status + manage dialog ───────────────────────────────
    const statusTone = link.syncStatus === 'error' ? 'danger' : 'ok';

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setManageOpen(true)}
                className="gap-2 text-muted-foreground hover:text-foreground"
            >
                <NotionLogo className="size-4" />
                <span className="hidden items-center gap-1.5 sm:inline-flex">
                    Notion
                    <Chip tone={statusTone} dot>
                        {link.syncStatus === 'error' ? 'Error' : 'Synced'}
                    </Chip>
                </span>
            </Button>

            <FormDialog
                open={manageOpen}
                onOpenChange={setManageOpen}
                title="Notion sync"
                description={
                    link.lastSyncedAt
                        ? `Last synced ${new Date(link.lastSyncedAt).toLocaleString()}`
                        : 'Not synced yet.'
                }
                submitLabel={
                    syncing ? (
                        <>
                            <Spinner size={14} />
                            Syncing…
                        </>
                    ) : (
                        <>
                            <RefreshCw className="size-4" />
                            Sync now
                        </>
                    )
                }
                submitDisabled={syncing}
                closeOnSuccess={false}
                onSubmit={handleSyncNow}
            >
                <Field label="Linked page">
                    <div className="flex items-center justify-between rounded-md border border-input bg-card px-2.5 py-2 text-[13px]">
                        <span className="truncate">{link.externalTitle || link.externalId}</span>
                        {link.externalUrl && (
                            <a
                                href={link.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                                aria-label="Open in Notion"
                            >
                                <ExternalLink className="size-3.5" />
                            </a>
                        )}
                    </div>
                </Field>
                <Field label="Sync direction">
                    <Select
                        value={link.direction}
                        onChange={handleDirectionChange}
                        options={DIRECTION_OPTIONS}
                    />
                </Field>
                {link.syncStatus === 'error' && link.lastError ? (
                    <p className="text-[12px] text-danger">{link.lastError}</p>
                ) : null}
                <div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-muted"
                        onClick={() => setUnlinkOpen(true)}
                    >
                        Unlink from Notion
                    </Button>
                </div>
            </FormDialog>

            <ConfirmDialog
                open={unlinkOpen}
                onOpenChange={setUnlinkOpen}
                title="Unlink from Notion?"
                description="Syncing stops. The document keeps its current content."
                confirmLabel="Unlink"
                onConfirm={handleUnlink}
            />
        </>
    );
}
