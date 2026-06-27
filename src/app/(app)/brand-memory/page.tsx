'use client';

import { useState, useEffect, useCallback, useReducer } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import {
    Button,
    Card,
    Chip,
    SearchInput,
    Skeleton,
    EmptyState,
    Pagination,
    BulkBar,
    FormDialog,
    Field,
    Select,
    Textarea,
    Input,
    type ChipTone,
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
    metadata?: Record<string, string | number | boolean | null>;
    createdAt: string;
}

interface PaginationState {
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
        case 'copilot': return Bot;
        case 'crm': return Users;
        case 'social': return BarChart3;
        case 'inbox': return Mail;
        case 'forms': return FormInput;
        default: return FileText;
    }
}

function getSourceTone(source: string): ChipTone {
    switch (source) {
        case 'copilot': return 'brand';
        case 'crm': return 'info';
        case 'social': return 'purple';
        case 'inbox': return 'ok';
        case 'forms': return 'warn';
        default: return 'gray';
    }
}

interface ListState {
    entries: KnowledgeEntry[];
    pagination: PaginationState;
    isLoading: boolean;
}

type ListAction =
    | { type: 'start' }
    | { type: 'loaded'; entries: KnowledgeEntry[]; pagination: PaginationState }
    | { type: 'error' };

const initialListState: ListState = {
    entries: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false },
    isLoading: true,
};

function listReducer(state: ListState, action: ListAction): ListState {
    switch (action.type) {
        case 'start':
            return { ...state, isLoading: true };
        case 'loaded':
            return { ...state, entries: action.entries, pagination: action.pagination, isLoading: false };
        case 'error':
            return { ...state, isLoading: false };
        default:
            return state;
    }
}

export default function BrandMemoryPage() {
    const { toast } = useToast();

    const [{ entries, pagination, isLoading }, listDispatch] = useReducer(listReducer, initialListState);
    const [brands, setBrands] = useState<{ _id: string; name: string }[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    const [selectedSource, setSelectedSource] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
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
    }, [selectedBrandId]);

    // Fetch entries
    const fetchEntries = useCallback(async (page = 1) => {
        if (!selectedBrandId) return;
        listDispatch({ type: 'start' });
        try {
            const params = new URLSearchParams({ brandId: selectedBrandId, page: String(page), limit: '20' });
            if (selectedSource !== 'all') params.set('sourceModule', selectedSource);
            if (searchQuery) params.set('search', searchQuery);

            const res = await fetch(`/api/v2/brand-memory?${params}`);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            listDispatch({ type: 'loaded', entries: data.entries, pagination: data.pagination });
        } catch {
            listDispatch({ type: 'error' });
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load brand memory.' });
        }
    }, [selectedBrandId, selectedSource, searchQuery, toast]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const handleAddEntry = async () => {
        if (!newEntry.name.trim() || !newEntry.content.trim()) {
            toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill in name and content.' });
            throw new Error('Missing fields');
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
        <ModuleShell
            title="Brand Memory"
            icon={Brain}
            meta="Knowledge base"
            primaryAction={
                <Button variant="brand" size="sm" icon={Plus} onClick={() => setIsAddOpen(true)}>
                    Add Entry
                </Button>
            }
        >
            {/* Filters Bar */}
            <div className="flex flex-col gap-3 sm:flex-row">
                {brands.length > 1 && (
                    <Select
                        value={selectedBrandId}
                        onChange={setSelectedBrandId}
                        placeholder="Select brand"
                        options={brands.map(b => ({ value: b._id, label: b.name }))}
                        triggerClassName="w-[200px]"
                    />
                )}

                <div className="max-w-sm flex-1">
                    <SearchInput
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search entries..."
                    />
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {SOURCE_MODULES.map(s => (
                        <Chip
                            key={s.value}
                            tone={selectedSource === s.value ? 'brand' : 'gray'}
                            selected={selectedSource === s.value}
                            icon={s.icon}
                            onClick={() => setSelectedSource(s.value)}
                        >
                            {s.label}
                        </Chip>
                    ))}
                </div>
            </div>

            {/* Stats + Bulk selection bar */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-muted-foreground">
                    {pagination.total} entries{selectedSource !== 'all' ? ` from ${selectedSource}` : ''}
                    {searchQuery ? ` matching "${searchQuery}"` : ''}
                </span>
            </div>

            <BulkBar
                count={selectedEntries.size}
                onClear={() => setSelectedEntries(new Set())}
            >
                <Button variant="outline" size="sm" icon={Trash2} onClick={handleDeleteSelected}
                    className="border-danger text-danger hover:bg-danger-muted">
                    Delete
                </Button>
            </BulkBar>

            {/* Entries List */}
            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                    ))}
                </div>
            ) : entries.length === 0 ? (
                <EmptyState
                    icon={Brain}
                    title="No knowledge entries yet"
                    note="Add brand knowledge manually or let it grow automatically from your CRM, Social, Inbox, and Agent interactions."
                    cta={
                        <Button variant="brand" size="sm" icon={Plus} onClick={() => setIsAddOpen(true)}>
                            Add First Entry
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-2">
                    {entries.map(entry => {
                        const SourceIcon = getSourceIcon(entry.sourceModule);
                        const selected = selectedEntries.has(entry._id);
                        return (
                            <div
                                key={entry._id}
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleEntry(entry._id)}
                                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleEntry(entry._id)}
                            >
                                <Card
                                    lift
                                    className={cn(
                                        "cursor-pointer p-4 transition-colors",
                                        selected && "border-brand bg-brand-muted/30"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-1 flex items-center gap-2">
                                                <h4 className="truncate text-sm font-medium">{entry.name}</h4>
                                                <Chip tone={getSourceTone(entry.sourceModule)} icon={SourceIcon}>
                                                    {entry.sourceModule}
                                                </Chip>
                                                <Chip tone="gray">{entry.type}</Chip>
                                            </div>
                                            <p className="line-clamp-2 text-[12.5px] text-muted-foreground">
                                                {entry.content}
                                            </p>
                                        </div>
                                        <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                                            {new Date(entry.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        );
                    })}
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

            {/* Add entry dialog */}
            <FormDialog
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                title="Add Knowledge Entry"
                icon={Brain}
                submitLabel="Add Entry"
                submitting={isSaving}
                onSubmit={handleAddEntry}
            >
                <Field label="Entry Title" required>
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
                <Field label="Content" required>
                    <Textarea
                        value={newEntry.content}
                        onChange={e => setNewEntry(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Paste or type the knowledge content..."
                        rows={8}
                    />
                </Field>
            </FormDialog>
        </ModuleShell>
    );
}
