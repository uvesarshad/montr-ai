'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Button,
    Chip,
    Field,
    Input,
    SearchInput,
    Textarea,
    Select,
    Skeleton,
    EmptyState,
    Pagination,
    FormDialog,
    ConfirmDialog,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import {
    Brain, Plus, Trash2, FileText,
    BarChart3, Users, Mail, FormInput, Bot, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KnowledgeEntry {
    _id: string;
    name: string;
    content: string;
    type: string;
    sourceModule: string;
    brandId?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
}

const SOURCE_MODULES = [
    { value: 'all', label: 'All Sources', icon: Filter },
    { value: 'manual', label: 'Manual', icon: FileText },
    { value: 'copilot', label: 'Agent', icon: Bot },
    { value: 'crm', label: 'CRM', icon: Users },
    { value: 'social', label: 'Social', icon: BarChart3 },
    { value: 'inbox', label: 'Inbox', icon: Mail },
    { value: 'forms', label: 'Forms', icon: FormInput },
];

const TYPE_OPTIONS = [
    { value: 'text', label: 'Text' },
    { value: 'url', label: 'URL' },
    { value: 'document', label: 'Document' },
    { value: 'faq', label: 'FAQ' },
];

function getSourceIcon(source: string) {
    switch (source) {
        case 'copilot': return <Bot className="size-3.5" />;
        case 'crm': return <Users className="size-3.5" />;
        case 'social': return <BarChart3 className="size-3.5" />;
        case 'inbox': return <Mail className="size-3.5" />;
        case 'forms': return <FormInput className="size-3.5" />;
        default: return <FileText className="size-3.5" />;
    }
}

type ChipTone = 'gray' | 'ok' | 'warn' | 'info' | 'danger' | 'brand' | 'purple';

function getSourceTone(source: string): ChipTone {
    switch (source) {
        case 'copilot': return 'purple';
        case 'crm': return 'info';
        case 'social': return 'danger';
        case 'inbox': return 'ok';
        case 'forms': return 'warn';
        default: return 'gray';
    }
}

export function BrandMemoryView() {
    const { toast } = useToast();

    const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false });
    const [isLoading, setIsLoading] = useState(true);
    const [brands, setBrands] = useState<{ _id: string; name: string }[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    const [selectedSource, setSelectedSource] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

    // New entry form
    const [newEntry, setNewEntry] = useState({ name: '', content: '', type: 'text' });

    // Fetch brands
    useEffect(() => {
        fetch('/api/social/brands')
            .then(res => res.ok ? res.json() : [])
            .then((data: { _id: string; name: string }[]) => {
                setBrands(data || []);
                if (data?.length > 0 && !selectedBrandId) {
                    setSelectedBrandId(data[0]._id);
                }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch entries
    const fetchEntries = useCallback(async (page = 1) => {
        if (!selectedBrandId) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ brandId: selectedBrandId, page: String(page), limit: '20' });
            if (selectedSource !== 'all') params.set('sourceModule', selectedSource);
            if (searchQuery) params.set('search', searchQuery);

            const res = await fetch(`/api/v2/brand-memory?${params}`);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setEntries(data.entries);
            setPagination(data.pagination);
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load brand memory.' });
        } finally {
            setIsLoading(false);
        }
    }, [selectedBrandId, selectedSource, searchQuery, toast]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const handleAddEntry = async () => {
        if (!newEntry.name.trim() || !newEntry.content.trim()) {
            toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill in name and content.' });
            throw new Error('missing fields');
        }
        setIsSaving(true);
        try {
            const res = await fetch('/api/v2/brand-memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    name: newEntry.name,
                    content: newEntry.content,
                    type: newEntry.type,
                }),
            });
            if (!res.ok) throw new Error('Failed to create');
            toast({ title: 'Entry Added', description: 'Knowledge entry has been added to brand memory.' });
            setNewEntry({ name: '', content: '', type: 'text' });
            fetchEntries();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to add entry.' });
            throw err;
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedEntries.size === 0) return;
        try {
            const res = await fetch('/api/v2/brand-memory', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedEntries) }),
            });
            if (!res.ok) throw new Error('Failed to delete');
            const data = await res.json();
            toast({ title: 'Entries Removed', description: `${data.deleted} entries have been removed.` });
            setSelectedEntries(new Set());
            fetchEntries();
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete entries.' });
        }
    };

    const toggleEntry = (id: string) => {
        setSelectedEntries(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    Your AI&apos;s knowledge base — everything your Agent knows about your brand.
                </p>
                <div className="flex gap-2">
                    {selectedEntries.size > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            icon={Trash2}
                            className="text-danger hover:bg-danger-muted"
                            onClick={() => setIsDeleteOpen(true)}
                        >
                            Delete ({selectedEntries.size})
                        </Button>
                    )}
                    <Button variant="primary" size="sm" icon={Plus} onClick={() => setIsAddOpen(true)}>
                        Add Entry
                    </Button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                {brands.length > 1 && (
                    <Select
                        value={selectedBrandId}
                        onChange={setSelectedBrandId}
                        placeholder="Select brand"
                        triggerClassName="w-[200px]"
                        options={brands.map(b => ({ value: b._id, label: b.name }))}
                    />
                )}

                <SearchInput
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search entries..."
                    wrapClassName="flex-1 max-w-sm"
                />

                <div className="flex gap-1.5 flex-wrap">
                    {SOURCE_MODULES.map(s => (
                        <Chip
                            key={s.value}
                            icon={s.icon}
                            tone={selectedSource === s.value ? 'brand' : 'gray'}
                            selected={selectedSource === s.value}
                            onClick={() => setSelectedSource(s.value)}
                        >
                            {s.label}
                        </Chip>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="text-sm text-muted-foreground">
                {pagination.total} entries{selectedSource !== 'all' ? ` from ${selectedSource}` : ''}
                {searchQuery ? ` matching "${searchQuery}"` : ''}
            </div>

            {/* Entries List */}
            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                </div>
            ) : entries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card">
                    <EmptyState
                        icon={Brain}
                        title="No knowledge entries yet"
                        note="Add brand knowledge manually or let it grow automatically from your CRM, Social, Inbox, and Agent interactions."
                        cta={<Button variant="primary" icon={Plus} onClick={() => setIsAddOpen(true)}>Add First Entry</Button>}
                    />
                </div>
            ) : (
                <div className="space-y-2">
                    {entries.map(entry => (
                        <div
                            key={entry._id}
                            className={cn(
                                'border border-border rounded-lg p-4 transition-colors hover:bg-muted/30 cursor-pointer',
                                selectedEntries.has(entry._id) && 'border-brand bg-brand-muted/50'
                            )}
                            onClick={() => toggleEntry(entry._id)}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium text-sm truncate">{entry.name}</h4>
                                        <Chip tone={getSourceTone(entry.sourceModule)}>
                                            {getSourceIcon(entry.sourceModule)}
                                            {entry.sourceModule}
                                        </Chip>
                                        <Chip tone="gray">{entry.type}</Chip>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {entry.content}
                                    </p>
                                </div>
                                <div className="font-mono text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
                                    {new Date(entry.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <Pagination
                    page={pagination.page}
                    pageSize={pagination.limit}
                    total={pagination.total}
                    onPageChange={(p) => fetchEntries(p)}
                />
            )}

            {/* Add Entry Dialog */}
            <FormDialog
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                title="Add Knowledge Entry"
                icon={Brain}
                submitLabel="Add Entry"
                submitting={isSaving}
                onSubmit={handleAddEntry}
            >
                <Field label="Entry Title">
                    <Input
                        value={newEntry.name}
                        onChange={e => setNewEntry(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Brand Guidelines, FAQ, Product Info..."
                    />
                </Field>
                <Field label="Type">
                    <Select
                        value={newEntry.type}
                        onChange={val => setNewEntry(prev => ({ ...prev, type: val }))}
                        options={TYPE_OPTIONS}
                    />
                </Field>
                <Field label="Content">
                    <Textarea
                        value={newEntry.content}
                        onChange={e => setNewEntry(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Paste or type the knowledge content..."
                        rows={8}
                    />
                </Field>
            </FormDialog>

            {/* Delete confirm */}
            <ConfirmDialog
                open={isDeleteOpen}
                onOpenChange={setIsDeleteOpen}
                title={`Delete ${selectedEntries.size} ${selectedEntries.size === 1 ? 'entry' : 'entries'}?`}
                description="This permanently removes the selected knowledge from your brand memory."
                confirmLabel="Delete"
                onConfirm={handleDeleteSelected}
            />
        </div>
    );
}
