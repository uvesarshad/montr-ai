'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Rss, Plus, Trash2, Loader2, ExternalLink, AlertCircle } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import {
    Button,
    Card,
    Chip,
    Input,
    Field,
    Select,
    SettingRow,
    EmptyState,
    Skeleton,
    Banner,
    ConfirmDialog,
} from '@/components/ui-kit';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface Brand {
    _id: string;
    name: string;
    handle: string;
}

interface RssSource {
    _id: string;
    name: string;
    feedUrl: string;
    enabled: boolean;
    targetPlatforms: string[];
    cadenceMinutes: number;
    generateImage: boolean;
    autoApprove: boolean;
    lastFetchedAt?: string | null;
    lastError?: string | null;
}

const PLATFORM_OPTIONS = [
    'x',
    'linkedin',
    'facebook',
    'instagram',
    'threads',
    'bluesky',
    'mastodon',
    'telegram',
    'pinterest',
    'reddit',
] as const;

const CADENCE_OPTIONS = [
    { value: '15', label: 'Every 15 minutes' },
    { value: '30', label: 'Every 30 minutes' },
    { value: '60', label: 'Hourly' },
    { value: '180', label: 'Every 3 hours' },
    { value: '360', label: 'Every 6 hours' },
    { value: '720', label: 'Every 12 hours' },
    { value: '1440', label: 'Daily' },
];

const emptyForm = {
    name: '',
    feedUrl: '',
    cadenceMinutes: '60',
    generateImage: false,
    autoApprove: false,
    targetPlatforms: [] as string[],
};

export default function AutopostPage() {
    const { toast } = useToast();

    const [brands, setBrands] = useState<Brand[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    const [sources, setSources] = useState<RssSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // Load brands
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/social/brands');
                const data = await res.json();
                const list: Brand[] = data.brands || [];
                setBrands(list);
                if (list.length) setSelectedBrandId(list[0]._id);
            } catch {
                toast({ title: 'Failed to load brands', variant: 'destructive' });
            }
        })();
    }, [toast]);

    const loadSources = useCallback(async () => {
        if (!selectedBrandId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/social/autopost?brandId=${selectedBrandId}`);
            const data = await res.json();
            setSources(data.sources || []);
        } catch {
            toast({ title: 'Failed to load sources', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [selectedBrandId, toast]);

    useEffect(() => {
        if (selectedBrandId) loadSources();
    }, [selectedBrandId, loadSources]);

    const togglePlatform = (platform: string) => {
        setForm((f) => ({
            ...f,
            targetPlatforms: f.targetPlatforms.includes(platform)
                ? f.targetPlatforms.filter((p) => p !== platform)
                : [...f.targetPlatforms, platform],
        }));
    };

    const handleCreate = async () => {
        if (!selectedBrandId) return;
        if (!form.name.trim() || !form.feedUrl.trim()) {
            toast({ title: 'Name and feed URL are required', variant: 'destructive' });
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/social/autopost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    name: form.name.trim(),
                    feedUrl: form.feedUrl.trim(),
                    cadenceMinutes: Number(form.cadenceMinutes),
                    generateImage: form.generateImage,
                    autoApprove: form.autoApprove,
                    targetPlatforms: form.targetPlatforms,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create source');
            }
            toast({ title: 'Source added' });
            setForm(emptyForm);
            loadSources();
        } catch (e) {
            toast({ title: e instanceof Error ? e.message : 'Failed to create source', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleToggleEnabled = async (source: RssSource) => {
        try {
            const res = await fetch(`/api/social/autopost/${source._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !source.enabled }),
            });
            if (!res.ok) throw new Error();
            setSources((prev) =>
                prev.map((s) => (s._id === source._id ? { ...s, enabled: !s.enabled } : s)),
            );
        } catch {
            toast({ title: 'Failed to update source', variant: 'destructive' });
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            const res = await fetch(`/api/social/autopost/${deleteId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            setSources((prev) => prev.filter((s) => s._id !== deleteId));
            toast({ title: 'Source deleted' });
        } catch {
            toast({ title: 'Failed to delete source', variant: 'destructive' });
        } finally {
            setDeleteId(null);
        }
    };

    const brandOptions = useMemo(
        () => brands.map((b) => ({ value: b._id, label: b.name })),
        [brands],
    );

    return (
        <ModuleShell
            title="RSS Autopost"
            icon={Rss}
            contentClassName="flex flex-col gap-4 pb-8"
            secondaryActions={
                brandOptions.length > 1 ? (
                    <Select
                        value={selectedBrandId}
                        onChange={(v) => setSelectedBrandId(v)}
                        options={brandOptions}
                    />
                ) : undefined
            }
        >
            <Banner tone="info">
                AI turns new articles from your feeds into social posts. By default they are saved as
                drafts for review; enable &ldquo;auto-approve&rdquo; to route them straight through your
                approval workflow.
            </Banner>

            {/* Add source */}
            <Card icon={Plus} title="Add a feed">
                <div className="flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Name">
                            <Input
                                placeholder="e.g. Company Blog"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                        </Field>
                        <Field label="Feed URL">
                            <Input
                                placeholder="https://example.com/feed.xml"
                                value={form.feedUrl}
                                onChange={(e) => setForm((f) => ({ ...f, feedUrl: e.target.value }))}
                            />
                        </Field>
                    </div>

                    <Field label="Cadence">
                        <Select
                            value={form.cadenceMinutes}
                            onChange={(v) => setForm((f) => ({ ...f, cadenceMinutes: v }))}
                            options={CADENCE_OPTIONS}
                        />
                    </Field>

                    <Field label="Target platforms">
                        <div className="flex flex-wrap gap-2">
                            {PLATFORM_OPTIONS.map((p) => (
                                <Chip
                                    key={p}
                                    selected={form.targetPlatforms.includes(p)}
                                    onClick={() => togglePlatform(p)}
                                >
                                    {p}
                                </Chip>
                            ))}
                        </div>
                    </Field>

                    <SettingRow
                        label="Generate an image"
                        description="Attach an AI-generated image to each post (when supported)."
                    >
                        <Switch
                            checked={form.generateImage}
                            onCheckedChange={(v) => setForm((f) => ({ ...f, generateImage: v }))}
                        />
                    </SettingRow>

                    <SettingRow
                        label="Auto-approve"
                        description="Route generated posts straight into the publishing/approval workflow instead of saving them as drafts."
                    >
                        <Switch
                            checked={form.autoApprove}
                            onCheckedChange={(v) => setForm((f) => ({ ...f, autoApprove: v }))}
                        />
                    </SettingRow>

                    <div className="flex justify-end">
                        <Button variant="brand" icon={saving ? Loader2 : Plus} onClick={handleCreate} disabled={saving}>
                            {saving ? 'Adding…' : 'Add source'}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Sources list */}
            {loading ? (
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                </div>
            ) : sources.length === 0 ? (
                <EmptyState
                    icon={Rss}
                    title="No feeds yet"
                    note="Add an RSS or Atom feed above to start auto-generating posts."
                />
            ) : (
                <div className="flex flex-col gap-3">
                    {sources.map((source) => (
                        <Card key={source._id}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{source.name}</span>
                                        {source.autoApprove ? (
                                            <Chip tone="ok">auto-approve</Chip>
                                        ) : (
                                            <Chip>drafts</Chip>
                                        )}
                                        {source.generateImage && <Chip>+ image</Chip>}
                                    </div>
                                    <a
                                        href={source.feedUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline truncate"
                                    >
                                        {source.feedUrl}
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span>
                                            Every {source.cadenceMinutes < 60
                                                ? `${source.cadenceMinutes}m`
                                                : `${Math.round(source.cadenceMinutes / 60)}h`}
                                        </span>
                                        {source.targetPlatforms?.length > 0 && (
                                            <span>· {source.targetPlatforms.join(', ')}</span>
                                        )}
                                        {source.lastFetchedAt && (
                                            <span>
                                                · last checked{' '}
                                                {new Date(source.lastFetchedAt).toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                    {source.lastError && (
                                        <div className="flex items-center gap-1.5 text-xs text-destructive">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                            {source.lastError}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <Switch
                                        checked={source.enabled}
                                        onCheckedChange={() => handleToggleEnabled(source)}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={Trash2}
                                        onClick={() => setDeleteId(source._id)}
                                    />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={Boolean(deleteId)}
                onOpenChange={(o) => !o && setDeleteId(null)}
                title="Delete this feed?"
                description="The source will stop generating posts. Existing drafts/posts are not affected."
                confirmLabel="Delete"
                destructive
                onConfirm={handleDelete}
            />
        </ModuleShell>
    );
}
