'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import { Plus, Pencil, Trash2, Eye, EyeOff, LayoutTemplate, FileText, Mail, BarChart2, Compass, PenSquare, Ban, CheckCircle2 } from 'lucide-react';

import {
    Button,
    Chip,
    Tabs,
    Skeleton,
    Card,
    PageHeader,
    ActionMenu,
    ConfirmDialog,
} from '@/components/ui-kit';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Template {
    _id: string;
    title: string;
    description: string;
    icon: string;
    isActive: boolean;
    sortOrder: number;
    createdAt: string;
}

const TemplateIcon = ({ iconName, className }: { iconName: string, className?: string }) => {
    const icons: Record<string, React.ElementType<{ className?: string }>> = {
        Mail,
        BarChart2,
        FileText,
        LayoutTemplate,
        Compass,
        PenSquare
    };
    const Icon = icons[iconName] || FileText;
    return <Icon className={className} />;
};

export default function TemplatesPage() {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'forms' | 'docs'>('forms');
    const [isExploreOpen, setIsExploreOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

    // Fetch templates
    const { data: formData, isLoading: isFormsLoading } = useSWR('/api/admin/templates/forms', fetcher);
    const { data: docData, isLoading: isDocsLoading } = useSWR('/api/admin/templates/docs', fetcher);

    const templates = activeTab === 'forms' ? formData?.templates : docData?.templates;
    const isLoading = activeTab === 'forms' ? isFormsLoading : isDocsLoading;

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/templates/${activeTab}/${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) throw new Error('Failed to delete template');

            toast({ title: 'Template deleted successfully' });
            mutate(`/api/admin/templates/${activeTab}`);
        } catch (_error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Could not delete template',
            });
            throw _error;
        }
    };

    const toggleActive = async (template: Template) => {
        try {
            const res = await fetch(`/api/admin/templates/${activeTab}/${template._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !template.isActive }),
            });

            if (!res.ok) throw new Error('Failed to update template');

            mutate(`/api/admin/templates/${activeTab}`);
            toast({ title: `Template ${template.isActive ? 'deactivated' : 'activated'}` });
        } catch (_error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Could not update template status',
            });
        }
    };

    return (
        <div className="container max-w-7xl py-8">
            <PageHeader
                icon={LayoutTemplate}
                title="Template Gallery"
                sub="Manage and organize templates for your users."
                actions={
                    <Button variant="brand" icon={Plus} onClick={() => setIsExploreOpen(true)}>
                        Explore Templates
                    </Button>
                }
                className="mb-8"
            />

            <Tabs
                value={activeTab}
                onChange={(v) => setActiveTab(v as 'forms' | 'docs')}
                className="mb-8"
                tabs={[
                    { value: 'forms', label: <span className="flex items-center gap-2"><LayoutTemplate className="size-4" /> Form Templates</span> },
                    { value: 'docs', label: <span className="flex items-center gap-2"><FileText className="size-4" /> Doc Templates</span> },
                ]}
            />

            {isLoading ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-[280px] w-full rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Existing Templates */}
                    {templates?.map((template: Template) => (
                        <Card key={template._id} lift className="group">
                            <div className="flex flex-1 flex-col p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <Chip tone={template.isActive ? 'ok' : 'gray'} icon={template.isActive ? CheckCircle2 : Ban}>
                                        {template.isActive ? 'Active' : 'Inactive'}
                                    </Chip>
                                    <ActionMenu
                                        items={[
                                            {
                                                label: template.isActive ? 'Deactivate' : 'Activate',
                                                icon: template.isActive ? EyeOff : Eye,
                                                onSelect: () => toggleActive(template),
                                            },
                                            {
                                                label: 'Delete',
                                                icon: Trash2,
                                                danger: true,
                                                separatorBefore: true,
                                                onSelect: () => setDeleteTarget(template),
                                            },
                                        ]}
                                    />
                                </div>

                                <Link href={`/admin/templates/${activeTab}/${template._id}`} className="block flex-grow">
                                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent/40 text-brand">
                                        <TemplateIcon iconName={template.icon} className="size-6" />
                                    </div>
                                    <div>
                                        <h3 className="mb-2 text-lg font-semibold leading-tight group-hover:text-brand">{template.title}</h3>
                                        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                                            {template.description || "No description provided."}
                                        </p>
                                    </div>
                                </Link>

                                <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                                    <span>Order: {template.sortOrder}</span>
                                    <Button variant="ghost" size="sm" iconRight={Pencil} asChild>
                                        <Link href={`/admin/templates/${activeTab}/${template._id}`}>
                                            Edit Template
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}

                    {/* Explore / Add New Card */}
                    <button
                        type="button"
                        onClick={() => setIsExploreOpen(true)}
                        className="group flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border p-8 bg-background transition-colors hover:border-brand hover:bg-muted/40 cursor-pointer"
                    >
                        <div className="rounded-full bg-accent/40 p-4 text-brand transition-transform group-hover:scale-110">
                            <Plus className="size-8" />
                        </div>
                        <div className="text-center">
                            <h3 className="mb-1 text-lg font-semibold group-hover:text-brand">Explore Templates</h3>
                            <p className="text-sm text-muted-foreground">Browse library or start blank</p>
                        </div>
                    </button>
                </div>
            )}

            {/* Delete confirm */}
            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                title="Delete Template?"
                description={deleteTarget ? `This will permanently delete "${deleteTarget.title}". This action cannot be undone.` : undefined}
                onConfirm={async () => { if (deleteTarget) await handleDelete(deleteTarget._id); }}
            />

            {/* Explore Templates Dialog */}
            <Dialog open={isExploreOpen} onOpenChange={setIsExploreOpen}>
                <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-2xl">Explore Templates</DialogTitle>
                        <DialogDescription>
                            Choose a starting point for your new {activeTab === 'forms' ? 'form' : 'document'} template.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-6">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {/* Blank Starter */}
                            <Link
                                href={`/admin/templates/${activeTab}/new`}
                                onClick={() => setIsExploreOpen(false)}
                                className="group relative flex flex-col rounded-2xl border-2 border-dashed border-border p-6 text-left bg-background transition-all hover:border-brand hover:bg-muted/40"
                            >
                                <div className="mb-4 w-fit rounded-xl border border-border bg-card p-3 shadow-sm transition-transform group-hover:scale-110">
                                    <Plus className="size-6 text-brand" />
                                </div>
                                <h3 className="mb-2 text-lg font-semibold">Blank Template</h3>
                                <p className="text-sm text-muted-foreground">Start from scratch and build your template exactly how you want it.</p>
                            </Link>

                            {/* Future System Templates (Mocked for now) */}
                            {['Standard Survey', 'Registration Form', 'Feedback Loop'].map((title, i) => (
                                <div key={i} className="group relative flex cursor-not-allowed flex-col rounded-2xl border border-border bg-card p-6 opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0">
                                    <div className="absolute right-3 top-3">
                                        <Chip tone="gray">Coming Soon</Chip>
                                    </div>
                                    <div className="mb-4 w-fit rounded-xl border border-border bg-muted p-3">
                                        <LayoutTemplate className="size-6 text-muted-foreground" />
                                    </div>
                                    <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                                    <p className="text-sm text-muted-foreground">Pre-configured template with best practices built-in.</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
