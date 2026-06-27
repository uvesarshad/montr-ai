'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import {
    AlertCircle,
    ArrowRight,
    Clock3,
    Download,
    ExternalLink,
    Loader2,
    Send,
    Star,
    Trash2,
    Workflow,
} from 'lucide-react';

import {
    Banner,
    Button,
    Card,
    Chip,
    type ChipTone,
    ConfirmDialog,
    EmptyState,
    Segmented,
    Skeleton,
} from '@/components/ui-kit';
import { useAppHeader } from '@/components/app-header';
import { useToast } from '@/hooks/use-toast';

interface MyTemplate {
    _id: string;
    name: string;
    description: string;
    category: string;
    difficulty: string;
    tags: string[];
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

const STATUS_CONFIG: Record<MyTemplate['status'], { label: string; tone: ChipTone }> = {
    draft: { label: 'Draft', tone: 'gray' },
    pending: { label: 'Pending Review', tone: 'warn' },
    published: { label: 'Published', tone: 'ok' },
    rejected: { label: 'Rejected', tone: 'danger' },
    archived: { label: 'Archived', tone: 'gray' },
};

const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

export default function MyTemplatesPage() {
    const { setHeaderInfo } = useAppHeader();
    const { toast } = useToast();

    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const queryString = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    const { data, isLoading, mutate } = useSWR<{ templates: MyTemplate[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
        `/api/v2/canvas-templates/my${queryString}`,
        fetcher
    );

    const templates = data?.templates || [];

    useEffect(() => {
        setHeaderInfo({
            type: 'page',
            title: 'My Templates',
            backHref: '/canvas/templates',
            actions: (
                <Link href="/canvas/templates">
                    <Button size="sm" icon={ExternalLink}>Browse Store</Button>
                </Link>
            ),
        });
        return () => setHeaderInfo(null);
    }, [setHeaderInfo]);

    const handlePublish = async (id: string) => {
        try {
            setPublishingId(id);
            const res = await fetch(`/api/v2/canvas-templates/${id}/publish`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Failed');
            }
            toast({ title: 'Submitted for review', description: 'We\'ll notify you when it\'s approved.' });
            mutate();
        } catch (err: unknown) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setPublishingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            setDeletingId(id);
            const res = await fetch(`/api/v2/canvas-templates/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Failed');
            }
            toast({ title: 'Template deleted' });
            mutate();
        } catch (err: unknown) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Unknown error' });
            throw err;
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    const statusTabs = [
        { value: 'all', label: 'All' },
        { value: 'draft', label: 'Drafts' },
        { value: 'pending', label: 'Pending' },
        { value: 'published', label: 'Published' },
        { value: 'rejected', label: 'Rejected' },
    ];

    return (
        <div className="flex flex-col gap-4 p-6 pb-10">
            {/* Status banner */}
            <Banner tone="brand" title="My Templates">
                Manage your submissions · {data?.pagination?.total ?? '—'} total
            </Banner>

            {/* Info banner */}
            <Banner tone="info" icon={AlertCircle} title="How community templates work">
                Save any canvas as a template draft from the canvas editor (Share icon in the toolbar). Submit for review to make it public.
                Our team reviews submissions within 1–3 business days.
            </Banner>

            {/* Templates list */}
            <Card bodyClassName="p-3.5">
                {/* Status filter tabs */}
                <Segmented
                    className="mb-3"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={statusTabs}
                />

                {isLoading ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <Card key={i} bodyClassName="p-3.5">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="mt-2 h-3 w-2/3" />
                            </Card>
                        ))}
                    </div>
                ) : templates.length === 0 ? (
                    <EmptyState
                        icon={Workflow}
                        title="No templates yet"
                        note="Open any canvas, click the Share icon in the toolbar, and package it as a template."
                        cta={
                            <Link href="/canvas">
                                <Button variant="outline" size="sm" icon={ArrowRight}>Go to Automations</Button>
                            </Link>
                        }
                    />
                ) : (
                    <div className="space-y-2">
                        {templates.map((t) => {
                            const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.draft;
                            return (
                                <Card key={t._id} bodyClassName="p-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="truncate text-[13px] font-semibold text-foreground">{t.name}</p>
                                                <Chip tone={statusCfg.tone}>{statusCfg.label}</Chip>
                                            </div>
                                            <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{t.description}</p>

                                            {/* Rejection reason */}
                                            {t.status === 'rejected' && t.rejectionReason && (
                                                <Banner tone="danger" icon={AlertCircle} className="mt-2 py-1.5">
                                                    {t.rejectionReason}
                                                </Banner>
                                            )}

                                            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Download className="size-2.5" />{t.usageCount.toLocaleString()} installs
                                                </span>
                                                {t.rating > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <Star className="size-2.5 fill-amber-400 text-amber-400" />{t.rating.toFixed(1)}
                                                    </span>
                                                )}
                                                {t.updatedAt && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock3 className="size-2.5" />
                                                        {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                            {/* View if published */}
                                            {t.status === 'published' && (
                                                <Link href={`/canvas/templates/${t._id}`}>
                                                    <Button variant="ghost" size="sm" icon={ExternalLink} aria-label="View in store" />
                                                </Link>
                                            )}

                                            {/* Submit for review (draft or rejected) */}
                                            {(t.status === 'draft' || t.status === 'rejected') && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    icon={publishingId === t._id ? Loader2 : Send}
                                                    className={publishingId === t._id ? '[&_svg]:animate-spin' : undefined}
                                                    onClick={() => handlePublish(t._id)}
                                                    disabled={publishingId === t._id}
                                                >
                                                    Submit
                                                </Button>
                                            )}

                                            {/* Delete */}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={deletingId === t._id ? Loader2 : Trash2}
                                                aria-label="Delete template"
                                                className={deletingId === t._id ? 'text-muted-foreground [&_svg]:animate-spin' : 'text-muted-foreground hover:text-danger'}
                                                onClick={() => setConfirmDeleteId(t._id)}
                                                disabled={deletingId === t._id}
                                            />
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </Card>

            <ConfirmDialog
                open={!!confirmDeleteId}
                onOpenChange={(open) => !open && setConfirmDeleteId(null)}
                title="Delete template?"
                description="This will permanently remove the template. Published templates will be removed from the store."
                confirmLabel="Delete"
                onConfirm={() => confirmDeleteId ? handleDelete(confirmDeleteId) : undefined}
            />
        </div>
    );
}
