'use client';

import { useForm } from '@/hooks/use-forms';
import { useAppHeader } from '@/components/app-header';
import {
    Button,
    Card,
    Chip,
    Skeleton,
    StatCard,
} from '@/components/ui-kit';
import {
    BarChart3,
    BookText,
    Copy,
    Eye,
    ExternalLink,
    Globe2,
    Loader2,
    Pencil,
    Settings
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FormSettings } from '@/components/forms/form-settings';
import { FormEditor } from '@/components/forms/form-editor';
import { useDebouncedCallback } from 'use-debounce';
import { VersionHistory } from '@/components/forms/version-history';
import { formatDistanceToNow } from 'date-fns';
import { ResourceLinkDialog, type ResourceLinkItem } from '@/components/link-resource-dialog';
import { buildLinkedFormEmbedSection } from '@/lib/forms/linked-form-content';
import { getSortedLinkableResources } from '@/lib/links/resource-linking';

export default function FormEditorPage() {
    const params = useParams();
    const id = params.id as string;
    const { push: routerPush } = useRouter();
    const { form, isLoading, updateForm } = useForm(id);
    const { setHeaderInfo } = useAppHeader();
    const { toast } = useToast();

    const [title, setTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isLinkNoteDialogOpen, setIsLinkNoteDialogOpen] = useState(false);
    const [isLinkingNote, setIsLinkingNote] = useState(false);
    const [availableDocs, setAvailableDocs] = useState<ResourceLinkItem[]>([]);
    const [isDocsLoading, setIsDocsLoading] = useState(false);
    const [linkedDoc, setLinkedDoc] = useState<ResourceLinkItem | null>(null);
    const [lastContent, setLastContent] = useState('');
    const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (form) {
            setTitle(form.title);
            setLastContent(form.content || '');
        }
    }, [form]);

    useEffect(() => {
        let cancelled = false;

        const loadLinkedDoc = async () => {
            try {
                const response = await fetch(`/api/v2/documents?referenceType=form&referenceId=${id}`);
                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                if (!cancelled) {
                    setLinkedDoc(data.documents?.[0] || null);
                }
            } catch (error) {
                console.error('Failed to load linked note:', error);
            }
        };

        loadLinkedDoc();

        return () => {
            cancelled = true;
        };
    }, [id]);

    const handleSaveTitle = useDebouncedCallback(async (newTitle: string) => {
        setIsSaving(true);
        try {
            await updateForm({ title: newTitle });
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    }, 1000);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
        handleSaveTitle(e.target.value);
    };

    const handleContentChange = useDebouncedCallback(async (content: string) => {
        setIsSaving(true);
        try {
            await updateForm({ content });
            setLastContent(content);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    }, 2000);

    useEffect(() => {
        if (!form) {
            return;
        }

        if (autoSaveIntervalRef.current) {
            clearInterval(autoSaveIntervalRef.current);
        }

        autoSaveIntervalRef.current = setInterval(async () => {
            if (lastContent && lastContent !== form.content) {
                try {
                    await fetch(`/api/v2/forms/${id}/versions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isAutoSave: true }),
                    });
                } catch (error) {
                    console.error('Auto-save version failed:', error);
                }
            }
        }, 30000);

        return () => {
            if (autoSaveIntervalRef.current) {
                clearInterval(autoSaveIntervalRef.current);
            }
        };
    }, [form, id, lastContent]);

    const handlePublishToggle = useCallback(async () => {
        if (!form) {
            return;
        }

        try {
            await updateForm({ isPublished: !form.isPublished });
            toast({
                title: form.isPublished ? 'Unpublished' : 'Published',
                description: form.isPublished ? 'Form is now private.' : 'Form is now live!',
            });
        } catch {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to update publish status.',
            });
        }
    }, [form, updateForm, toast]);

    const appendEmbedsToDocContent = useCallback((currentContent: string) => {
        if (!form) {
            return currentContent;
        }

        if (currentContent.includes(`formId="${id}"`)) {
            return currentContent;
        }

        return `${currentContent}${currentContent ? '<p></p>' : ''}${buildLinkedFormEmbedSection({
            formId: id,
            formTitle: form.title,
        })}`;
    }, [form, id]);

    const loadAvailableDocs = useCallback(async () => {
        setIsDocsLoading(true);

        try {
            const response = await fetch('/api/v2/documents?scope=all&sortBy=updatedAt');
            if (!response.ok) {
                throw new Error('Failed to load documents');
            }

            const data = await response.json();
            const items = getSortedLinkableResources(
                (data.documents || []).map((doc: { _id: string; title: string; updatedAt?: string }) => ({
                    _id: doc._id,
                    title: doc.title || 'Untitled',
                    subtitle: doc.updatedAt
                        ? `Updated ${formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}`
                        : 'Note',
                    updatedAt: doc.updatedAt,
                }))
            );

            setAvailableDocs(items);
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Notes unavailable',
                description: 'Could not load existing notes right now.',
            });
        } finally {
            setIsDocsLoading(false);
        }
    }, [toast]);

    const handleLinkExistingNote = useCallback(async (selectedDoc: ResourceLinkItem) => {
        if (!form) {
            return;
        }

        setIsLinkingNote(true);

        try {
            const docResponse = await fetch(`/api/v2/documents/${selectedDoc._id}`);
            if (!docResponse.ok) {
                throw new Error('Failed to load selected note');
            }

            const doc = await docResponse.json();
            const nextContent = appendEmbedsToDocContent(doc.content || '');

            const updateResponse = await fetch(`/api/v2/documents/${selectedDoc._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    referenceId: id,
                    referenceType: 'form',
                    content: nextContent,
                }),
            });

            if (!updateResponse.ok) {
                throw new Error('Failed to link selected note');
            }

            const updatedDoc = await updateResponse.json();
            setLinkedDoc(updatedDoc);
            setIsLinkNoteDialogOpen(false);
            routerPush(`/docs/${selectedDoc._id}`);
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Link failed',
                description: 'Could not connect the selected note to this form.',
            });
        } finally {
            setIsLinkingNote(false);
        }
    }, [appendEmbedsToDocContent, form, id, routerPush, toast]);

    const handleCreateLinkedNote = useCallback(async () => {
        if (!form) {
            return;
        }

        setIsLinkingNote(true);

        try {
            const linkedDocTitle = `${form.title} notes`;
            const linkedDocContent = [
                `<h1>${linkedDocTitle}</h1>`,
                '<p>Use this note to capture form goals, audience context, response analysis, and iteration ideas.</p>',
                buildLinkedFormEmbedSection({
                    formId: id,
                    formTitle: form.title,
                }),
                '<h2>Notes</h2>',
                '<p></p>',
            ].join('');

            const createDocResponse = await fetch('/api/v2/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: linkedDocTitle,
                    content: linkedDocContent,
                    referenceId: id,
                    referenceType: 'form',
                }),
            });

            if (!createDocResponse.ok) {
                throw new Error('Failed to create linked note');
            }

            const newDoc = await createDocResponse.json();
            setLinkedDoc(newDoc);
            setIsLinkNoteDialogOpen(false);
            routerPush(`/docs/${newDoc._id}`);
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Linked note unavailable',
                description: 'Could not create the linked note for this form.',
            });
        } finally {
            setIsLinkingNote(false);
        }
    }, [form, id, routerPush, toast]);

    const handleOpenLinkedNote = useCallback(async () => {
        if (linkedDoc?._id) {
            routerPush(`/docs/${linkedDoc._id}`);
            return;
        }

        setIsLinkNoteDialogOpen(true);
        if (!availableDocs.length) {
            await loadAvailableDocs();
        }
    }, [availableDocs.length, linkedDoc?._id, loadAvailableDocs, routerPush]);

    const handlePublishToggleRef = useRef(handlePublishToggle);
    useEffect(() => {
        handlePublishToggleRef.current = handlePublishToggle;
    }, [handlePublishToggle]);

    useEffect(() => {
        if (!form) return;

        setHeaderInfo({
            type: 'page',
            title: 'Edit Form',
            backHref: '/forms',
            actions: (
                <>
                    <Button variant="outline" size="sm" icon={BarChart3} asChild>
                        <Link href={`/forms/${id}/submissions`}>
                            <span className="hidden xl:inline">Submissions</span>
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        icon={BookText}
                        onClick={handleOpenLinkedNote}
                    >
                        <span className="hidden xl:inline">Linked Note</span>
                    </Button>
                    <Button variant="outline" size="sm" icon={Eye} asChild>
                        <Link href={`/f/${form.slug || id}`} target="_blank">
                            <span className="hidden xl:inline">Preview</span>
                        </Link>
                    </Button>
                    <VersionHistory formId={id} />
                    <Button
                        variant="outline"
                        size="sm"
                        icon={Settings}
                        onClick={() => setIsSettingsOpen(true)}
                    >
                        <span className="hidden xl:inline">Settings</span>
                    </Button>
                    <Button
                        variant={form.isPublished ? 'ghost' : 'brand'}
                        size="sm"
                        onClick={() => handlePublishToggleRef.current()}
                    >
                        {form.isPublished ? 'Unpublish' : 'Publish'}
                    </Button>
                </>
            )
        });

        return () => setHeaderInfo(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setHeaderInfo, form?.isPublished, form?.slug, handleOpenLinkedNote, id]);

    if (isLoading) {
        return (
            <div className="space-y-5 p-5">
                <Skeleton className="h-52 w-full rounded-[12px]" />
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <Skeleton className="h-[680px] w-full rounded-[12px]" />
                    <div className="space-y-4">
                        <Skeleton className="h-48 w-full rounded-[12px]" />
                        <Skeleton className="h-40 w-full rounded-[12px]" />
                    </div>
                </div>
            </div>
        );
    }

    if (!form) {
        return <div className="p-8">Form not found</div>;
    }

    const publicId = form.slug || id;
    const publicUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/f/${publicId}`
        : `/f/${publicId}`;

    const stats = [
        {
            label: 'Visibility',
            value: form.isPublished ? 'Live' : 'Draft',
            delta: form.isPublished ? 'Published' : 'Draft',
            up: form.isPublished,
        },
        {
            label: 'Views',
            value: String(form.views || 0),
            delta: 'Total public visits',
        },
        {
            label: 'Responses',
            value: String(form.submissionsCount || 0),
            delta: 'Captured submissions',
        },
        {
            label: 'Updated',
            value: formatDistanceToNow(new Date(form.updatedAt), { addSuffix: true }),
            delta: 'Latest saved change',
        },
    ];

    const copyPublicLink = async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            toast({ title: 'Public link copied' });
        } catch {
            toast({
                title: 'Copy failed',
                description: 'Could not copy the public form URL.',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="space-y-5 p-5 pt-3 pb-8">
            <Card>
                <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:border-none">
                    <div className="min-w-0 flex-1">
                        <div className="group flex items-center gap-3">
                            <input
                                ref={titleInputRef}
                                value={title}
                                onChange={handleTitleChange}
                                aria-label="Form title"
                                className="h-auto min-w-0 flex-1 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 sm:text-3xl"
                                placeholder="Untitled Form"
                            />
                            <Pencil
                                className="size-4 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100 cursor-pointer"
                                onClick={() => {
                                    titleInputRef.current?.focus();
                                    titleInputRef.current?.select();
                                }}
                            />

                            <div className="ml-auto flex shrink-0 items-center gap-2">
                                <Chip tone={form.isPublished ? 'ok' : 'warn'}>
                                    {form.isPublished ? 'Published' : 'Draft'}
                                </Chip>
                                {isSaving && (
                                    <Chip tone="gray">
                                        <Loader2 className="size-3 animate-spin" />
                                        Saving
                                    </Chip>
                                )}
                            </div>
                        </div>

                        {form.settings?.description && (
                            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                                {form.settings.description}
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">
                    <FormEditor
                        initialContent={form.content}
                        onChange={handleContentChange}
                    />
                </div>

                <aside className="space-y-4">
                    <Card icon={Globe2} title="Public Access" meta="Share or open the live endpoint.">
                        <div className="space-y-3 px-5 pb-4">
                            <div className="rounded-xl border bg-muted px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Public URL
                                </p>
                                <p className="mt-2 truncate text-sm font-medium text-foreground">{publicUrl}</p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    icon={Copy}
                                    onClick={copyPublicLink}
                                    disabled={!form.isPublished}
                                >
                                    Copy link
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    icon={ExternalLink}
                                    asChild={form.isPublished}
                                    disabled={!form.isPublished}
                                >
                                    {form.isPublished ? (
                                        <Link href={`/f/${publicId}`} target="_blank">
                                            Open live view
                                        </Link>
                                    ) : (
                                        <>Open live view</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <div className="grid grid-cols-2 gap-3">
                        {stats.map((stat) => (
                            <StatCard
                                key={stat.label}
                                label={stat.label}
                                value={stat.value}
                                delta={stat.delta}
                                up={stat.up}
                            />
                        ))}
                    </div>

                    <Card
                        icon={BarChart3}
                        title="Response Setup"
                        meta="Current public response behavior."
                        action={
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={Pencil}
                                onClick={() => setIsSettingsOpen(true)}
                            />
                        }
                    >
                        <div className="space-y-3 px-5 pb-4">
                            <StudioInfo label="Submit label" value={form.settings?.submitButtonText || 'Submit'} />
                            <StudioInfo
                                label="Thank-you message"
                                value={form.settings?.thankYouMessage || 'Thank you for your submission!'}
                                multiline
                            />
                            <StudioInfo
                                label="Redirect URL"
                                value={form.settings?.thankYouUrl || 'No redirect configured'}
                                muted={!form.settings?.thankYouUrl}
                            />
                        </div>
                    </Card>

                    <Card icon={BookText} title="Linked Note" meta="Keep context, insights, and the embedded form in one working doc.">
                        <div className="space-y-3 px-5 pb-4">
                            {linkedDoc ? (
                                <>
                                    <div className="rounded-xl border bg-muted px-3 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                            Note
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-foreground">{linkedDoc.title}</p>
                                    </div>

                                    <div className="grid gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            icon={BookText}
                                            onClick={handleOpenLinkedNote}
                                        >
                                            Open linked note
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            icon={BookText}
                                            onClick={() => {
                                                setIsLinkNoteDialogOpen(true);
                                                if (!availableDocs.length) {
                                                    void loadAvailableDocs();
                                                }
                                            }}
                                        >
                                            Link existing note
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="grid gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        icon={BookText}
                                        onClick={() => {
                                            setIsLinkNoteDialogOpen(true);
                                            if (!availableDocs.length) {
                                                void loadAvailableDocs();
                                            }
                                        }}
                                    >
                                        Link existing note
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        icon={isLinkingNote ? Loader2 : BookText}
                                        onClick={handleCreateLinkedNote}
                                        disabled={isLinkingNote}
                                    >
                                        Create new linked note
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Card>
                </aside>
            </div>

            <ResourceLinkDialog
                open={isLinkNoteDialogOpen}
                onOpenChange={setIsLinkNoteDialogOpen}
                title="Link Existing Note"
                description="Connect this form to a note you already have, or create a new linked note if needed."
                searchPlaceholder="Search notes..."
                emptyLabel="No notes found"
                items={availableDocs}
                isLoading={isDocsLoading}
                createLabel="Create new linked note"
                onCreate={handleCreateLinkedNote}
                onSelect={handleLinkExistingNote}
            />

            <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <SheetContent className="w-full overflow-y-auto border-l p-0 sm:max-w-[460px]">
                    <SheetHeader className="border-b px-6 py-5">
                        <SheetTitle>Form Settings</SheetTitle>
                        <SheetDescription>Control public metadata, submission behavior, and embedding.</SheetDescription>
                    </SheetHeader>
                    <div className="px-6 pb-6">
                        <FormSettings
                            form={form}
                            onUpdate={async (updates) => {
                                await updateForm(updates);
                                setIsSettingsOpen(false);
                            }}
                        />
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

function StudioInfo({
    label,
    value,
    multiline = false,
    muted = false,
}: {
    label: string;
    value: string;
    multiline?: boolean;
    muted?: boolean;
}) {
    return (
        <div className="rounded-[12px] border bg-background px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {label}
            </p>
            <p
                className={`mt-2 text-sm ${multiline ? 'leading-6' : 'truncate'} ${muted ? 'text-muted-foreground' : 'text-foreground'
                    }`}
            >
                {value}
            </p>
        </div>
    );
}
