'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';

import {
    Button,
    Chip,
    KpiRow,
    Skeleton,
    EmptyState,
    PageHeader,
    FormDialog,
    Field,
    Textarea,
    IconButton,
    Spinner,
    type ChipTone,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import {
    CheckCircle2,
    Clock3,
    Download,
    ExternalLink,
    Star,
    Workflow,
    XCircle,
} from 'lucide-react';

interface AdminTemplate {
    _id: string;
    name: string;
    description: string;
    category: string;
    difficulty: string;
    tags: string[];
    authorName: string;
    authorId?: string;
    usageCount: number;
    rating: number;
    ratingCount: number;
    isFeatured: boolean;
    isOfficial: boolean;
    isPublic: boolean;
    status: 'draft' | 'pending' | 'published' | 'rejected' | 'archived';
    rejectionReason?: string;
    version: string;
    createdAt?: string;
    updatedAt?: string;
}

interface AdminResponse {
    templates: AdminTemplate[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    counts: { pending: number; published: number; draft: number; rejected: number };
}

const STATUS_CONFIG: Record<AdminTemplate['status'], { label: string; tone: ChipTone }> = {
    draft: { label: 'Draft', tone: 'gray' },
    pending: { label: 'Pending', tone: 'warn' },
    published: { label: 'Published', tone: 'ok' },
    rejected: { label: 'Rejected', tone: 'danger' },
    archived: { label: 'Archived', tone: 'gray' },
};

const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Forbidden');
    return res.json();
};

function formatLabel(value?: string) {
    if (!value) return '';
    return value.split(/[_-]/g).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function AdminCanvasTemplatesPage() {
    const { toast } = useToast();
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [rejectDialog, setRejectDialog] = useState<{ id: string; name: string } | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const queryString = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    const { data, isLoading, mutate } = useSWR<AdminResponse>(
        `/api/v2/admin/canvas-templates${queryString}`,
        fetcher
    );

    const templates = data?.templates || [];
    const counts = data?.counts || { pending: 0, published: 0, draft: 0, rejected: 0 };

    const tabs = [
        { value: 'pending', label: 'Pending', count: counts.pending },
        { value: 'published', label: 'Published', count: counts.published },
        { value: 'draft', label: 'Draft', count: counts.draft },
        { value: 'rejected', label: 'Rejected', count: counts.rejected },
        { value: 'all', label: 'All', count: undefined as number | undefined },
    ];

    const handleApprove = async (id: string) => {
        try {
            setActioningId(id);
            const res = await fetch(`/api/v2/admin/canvas-templates/${id}/approve`, {
                method: 'PATCH',
                credentials: 'include',
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
            toast({ title: 'Template approved and published' });
            mutate();
        } catch (err: unknown) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setActioningId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectDialog || !rejectReason.trim()) return;
        try {
            setActioningId(rejectDialog.id);
            const res = await fetch(`/api/v2/admin/canvas-templates/${rejectDialog.id}/reject`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ reason: rejectReason.trim() }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
            toast({ title: 'Template rejected' });
            setRejectDialog(null);
            setRejectReason('');
            mutate();
        } catch (err: unknown) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Unknown error' });
            throw err;
        } finally {
            setActioningId(null);
        }
    };

    const handleFeatureToggle = async (id: string, current: boolean) => {
        try {
            setActioningId(id);
            const res = await fetch(`/api/v2/admin/canvas-templates/${id}/feature`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ isFeatured: !current }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
            toast({ title: !current ? 'Template featured' : 'Template unfeatured' });
            mutate();
        } catch (err: unknown) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setActioningId(null);
        }
    };

    return (
        <div className="space-y-5 p-6">
            <PageHeader
                icon={Workflow}
                title="Canvas Templates"
                sub="Review community-submitted templates and manage the marketplace."
            />

            {/* Stats row */}
            <KpiRow
                cols={4}
                items={[
                    { label: 'Pending', value: counts.pending, pastel: 'peach' },
                    { label: 'Published', value: counts.published, pastel: 'mint' },
                    { label: 'Drafts', value: counts.draft, pastel: 'blue' },
                    { label: 'Rejected', value: counts.rejected, pastel: 'rose' },
                ]}
            />

            {/* Tabs + table */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {/* Tab bar */}
                <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-3 py-2">
                    {tabs.map(({ value, label, count }) => (
                        <Chip
                            key={value}
                            tone={statusFilter === value ? 'brand' : 'gray'}
                            selected={statusFilter === value}
                            onClick={() => setStatusFilter(value)}
                            count={count !== undefined && count > 0 ? count : undefined}
                        >
                            {label}
                        </Chip>
                    ))}
                </div>

                {/* Table */}
                {isLoading ? (
                    <div className="divide-y divide-border">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={`skeleton-${i}`} className="flex items-center gap-4 px-4 py-3.5">
                                <Skeleton className="size-40" />
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="ml-auto h-4 w-20" />
                            </div>
                        ))}
                    </div>
                ) : templates.length === 0 ? (
                    <EmptyState
                        icon={Workflow}
                        title="No templates"
                        note={`No ${statusFilter !== 'all' ? statusFilter : ''} templates to review.`}
                    />
                ) : (
                    <div className="divide-y divide-border">
                        {templates.map((t) => {
                            const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.draft;
                            return (
                                <div key={t._id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate text-[13px] font-semibold text-foreground">{t.name}</p>
                                            <Chip tone={statusCfg.tone}>{statusCfg.label}</Chip>
                                            {t.isFeatured && <Chip tone="warn" icon={Star}>Featured</Chip>}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                                            <span>by {t.authorName}</span>
                                            <span>{formatLabel(t.category)}</span>
                                            <span className="flex items-center gap-1"><Download className="size-2.5" />{t.usageCount}</span>
                                            {t.rating > 0 && <span className="flex items-center gap-1"><Star className="size-2.5 fill-amber-400 text-amber-400" />{t.rating.toFixed(1)}</span>}
                                            {t.createdAt && <span className="flex items-center gap-1"><Clock3 className="size-2.5" />{formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}</span>}
                                        </div>
                                        {t.status === 'rejected' && t.rejectionReason && (
                                            <p className="mt-1 text-[11px] text-danger">{t.rejectionReason}</p>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-shrink-0 items-center gap-2">
                                        <IconButton icon={ExternalLink} iconSize={14} aria-label="Open template" onClick={() => window.open(`/canvas/templates/${t._id}`, '_blank')} />

                                        {t.status === 'published' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleFeatureToggle(t._id, t.isFeatured)}
                                                disabled={actioningId === t._id}
                                            >
                                                {actioningId === t._id
                                                    ? <Spinner size={13} />
                                                    : t.isFeatured ? 'Unfeature' : 'Feature'
                                                }
                                            </Button>
                                        )}

                                        {t.status === 'pending' && (
                                            <>
                                                <Button
                                                    variant="brand"
                                                    size="sm"
                                                    icon={CheckCircle2}
                                                    onClick={() => handleApprove(t._id)}
                                                    disabled={actioningId === t._id}
                                                >
                                                    {actioningId === t._id ? <Spinner size={13} className="border-current" /> : null}
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    icon={XCircle}
                                                    className="border-danger text-danger hover:bg-danger-muted"
                                                    onClick={() => setRejectDialog({ id: t._id, name: t.name })}
                                                    disabled={actioningId === t._id}
                                                >
                                                    Reject
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Reject dialog */}
            <FormDialog
                open={!!rejectDialog}
                onOpenChange={(open) => { if (!open) { setRejectDialog(null); setRejectReason(''); } }}
                title="Reject template"
                icon={XCircle}
                size="sm"
                destructive
                submitLabel="Reject template"
                submitDisabled={!rejectReason.trim()}
                submitting={!!actioningId}
                onSubmit={handleReject}
            >
                {rejectDialog && (
                    <p className="text-[13px] text-muted-foreground">
                        Rejecting <span className="font-semibold text-foreground">&quot;{rejectDialog.name}&quot;</span>. The author will see your reason.
                    </p>
                )}
                <Field label="Reason" required>
                    <Textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. Description is too short, or missing requirements information."
                        rows={3}
                        className="resize-none"
                        maxLength={500}
                    />
                </Field>
            </FormDialog>
        </div>
    );
}
