'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Clock, RotateCcw, Loader2, Save, AlertCircle, GitCompare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Alert,
    AlertDescription,
} from '@/components/ui/alert';

// ---------------------------------------------------------------------------
// Helpers to extract form fields from Tiptap JSON content
// ---------------------------------------------------------------------------

interface FormField {
    id: string;
    type: string;
    label: string;
    required: boolean;
    placeholder?: string;
}

function extractFields(contentJson: string): FormField[] {
    try {
        const content = JSON.parse(contentJson);
        const fields: FormField[] = [];
        const walk = (node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }) => {
            if (node.type === 'formField' && node.attrs?.id) {
                fields.push({
                    id: node.attrs.id as string,
                    type: (node.attrs.type as string) || 'text',
                    label: (node.attrs.label as string) || (node.attrs.id as string),
                    required: !!node.attrs.required,
                    placeholder: node.attrs.placeholder as string | undefined,
                });
            }
            (node.content as Array<{ type?: string; attrs?: Record<string, unknown>; content?: unknown[] }> | undefined)?.forEach(walk);
        };
        content.content?.forEach(walk);
        return fields;
    } catch {
        return [];
    }
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

interface FieldDiff {
    id: string;
    status: DiffStatus;
    before?: FormField;
    after?: FormField;
}

function diffFields(before: FormField[], after: FormField[]): FieldDiff[] {
    const beforeMap = new Map(before.map(f => [f.id, f]));
    const afterMap = new Map(after.map(f => [f.id, f]));
    const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    const diffs: FieldDiff[] = [];
    allIds.forEach(id => {
        const b = beforeMap.get(id);
        const a = afterMap.get(id);
        if (!b) {
            diffs.push({ id, status: 'added', after: a });
        } else if (!a) {
            diffs.push({ id, status: 'removed', before: b });
        } else if (b.type !== a.type || b.label !== a.label || b.required !== a.required) {
            diffs.push({ id, status: 'changed', before: b, after: a });
        } else {
            diffs.push({ id, status: 'unchanged', before: b, after: a });
        }
    });
    return diffs;
}

const STATUS_STYLES: Record<DiffStatus, string> = {
    added: 'border-l-2 border-l-green-500 bg-green-50/50 dark:bg-green-900/10',
    removed: 'border-l-2 border-l-red-500 bg-red-50/50 dark:bg-red-900/10 opacity-60',
    changed: 'border-l-2 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10',
    unchanged: 'border-l-2 border-l-transparent',
};

const STATUS_BADGE: Record<DiffStatus, string> = {
    added: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    removed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    changed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    unchanged: 'hidden',
};

interface FormVersion {
    _id: string;
    version: number;
    title: string;
    createdBy: string;
    createdAt: string;
    isAutoSave: boolean;
    changeDescription?: string;
}

interface VersionHistoryProps {
    formId: string;
    currentContent?: string;
    onRestore?: (content: string, title: string) => void;
}

export function VersionHistory({ formId, currentContent, onRestore }: VersionHistoryProps) {
    const [versions, setVersions] = useState<FormVersion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRestoring, setIsRestoring] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [compareVersion, setCompareVersion] = useState<{ title: string; diffs: FieldDiff[] } | null>(null);
    const [isComparing, setIsComparing] = useState<string | null>(null);
    const { toast } = useToast();

    const fetchVersions = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/v2/forms/${formId}/versions`);
            if (!response.ok) {
                throw new Error('Failed to fetch versions');
            }
            const data = await response.json();
            setVersions(data.versions);
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to load version history',
            });
        } finally {
            setIsLoading(false);
        }
    }, [formId, toast]);

    useEffect(() => {
        if (isOpen) {
            fetchVersions();
        }
    }, [fetchVersions, isOpen]);

    const handleRestore = async (versionId: string) => {
        if (!confirm('Are you sure you want to restore this version? Your current changes will be backed up.')) {
            return;
        }

        try {
            setIsRestoring(versionId);
            const response = await fetch(`/api/v2/forms/${formId}/versions/${versionId}/restore`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to restore version');
            }

            const data = await response.json();

            toast({
                title: 'Success',
                description: 'Form restored successfully',
            });

            if (onRestore && data.form) {
                onRestore(data.form.content, data.form.title);
            }

            await fetchVersions();
            setIsOpen(false);
            window.location.reload();
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to restore version',
            });
        } finally {
            setIsRestoring(null);
        }
    };

    const handleCompare = async (version: FormVersion) => {
        try {
            setIsComparing(version._id);
            const res = await fetch(`/api/v2/forms/${formId}/versions/${version._id}`);
            if (!res.ok) throw new Error('Failed to fetch version');
            const { version: versionData } = await res.json();

            const beforeFields = extractFields(versionData.content);
            const afterFields = currentContent ? extractFields(currentContent) : [];
            const diffs = diffFields(beforeFields, afterFields);

            setCompareVersion({ title: version.title, diffs });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load version for comparison.' });
        } finally {
            setIsComparing(null);
        }
    };

    return (
        <>
        <Sheet open={!!compareVersion} onOpenChange={open => { if (!open) setCompareVersion(null); }}>
            <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                <SheetHeader className="pb-4 border-b">
                    <SheetTitle>Comparing: {compareVersion?.title} → Current</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-2">
                    {compareVersion?.diffs.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">No fields found in either version.</p>
                    )}
                    {compareVersion?.diffs.map(diff => (
                        <div key={diff.id} className={`rounded-lg p-3 text-sm ${STATUS_STYLES[diff.status]}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{(diff.after || diff.before)?.label}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[diff.status]}`}>
                                    {diff.status !== 'unchanged' ? diff.status : ''}
                                </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                {diff.status === 'changed' && (
                                    <>
                                        <span>type: <span className="line-through text-red-500">{diff.before?.type}</span> → <span className="text-green-600">{diff.after?.type}</span></span>
                                        {diff.before?.required !== diff.after?.required && (
                                            <span>required: <span className="line-through text-red-500">{String(diff.before?.required)}</span> → <span className="text-green-600">{String(diff.after?.required)}</span></span>
                                        )}
                                    </>
                                )}
                                {diff.status !== 'changed' && (
                                    <span>type: {(diff.after || diff.before)?.type} · required: {String((diff.after || diff.before)?.required)}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-[0.4rem]">
                    <Clock className="mr-2 size-4 xl:mr-2 lg:mr-0" />
                    <span className="hidden xl:inline">Version History</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl overflow-hidden rounded-[12px] border p-0">
                <DialogHeader className="border-b px-6 py-5">
                    <DialogTitle>Version History</DialogTitle>
                    <DialogDescription>
                        Restore previous snapshots without leaving the builder.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 pb-6 pt-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-14">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : versions.length === 0 ? (
                        <div className="rounded-[12px] border border-dashed bg-muted/20 py-14 text-center text-muted-foreground">
                            <Clock className="mx-auto mb-4 size-12 opacity-50" />
                            <p className="text-sm font-medium text-foreground">No version history yet</p>
                            <p className="mt-2 text-sm">Automatic snapshots will appear as this form changes.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Alert className="rounded-[12px]">
                                <AlertCircle className="size-4" />
                                <AlertDescription>
                                    Restoring a version creates a backup of the current state first.
                                </AlertDescription>
                            </Alert>

                            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                {versions.map((version, index) => (
                                    <div
                                        key={version._id}
                                        className="flex items-start gap-4 rounded-[12px] border bg-card p-4 shadow-sm transition-colors hover:bg-muted/20"
                                    >
                                        <div className="flex flex-col items-center">
                                            <div
                                                className={`flex size-9 items-center justify-center rounded-[12px] border ${index === 0
                                                    ? 'border-primary/20 bg-primary text-primary-foreground'
                                                    : 'border-border bg-muted text-muted-foreground'
                                                    }`}
                                            >
                                                {version.isAutoSave ? (
                                                    <Save className="size-4" />
                                                ) : (
                                                    <span className="text-[11px] font-semibold">v{version.version}</span>
                                                )}
                                            </div>
                                            {index < versions.length - 1 && (
                                                <div className="mt-2 h-full w-px bg-border" />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="truncate text-sm font-semibold">{version.title}</h4>
                                                        {index === 0 && (
                                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                                                Current
                                                            </span>
                                                        )}
                                                        {version.isAutoSave && (
                                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                                                Auto-save
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                                                    </p>
                                                    {version.changeDescription && (
                                                        <p className="mt-2 text-xs text-muted-foreground italic">
                                                            {version.changeDescription}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex shrink-0 gap-2">
                                                    {currentContent && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="rounded-[0.4rem]"
                                                            onClick={() => handleCompare(version)}
                                                            disabled={isComparing === version._id}
                                                        >
                                                            {isComparing === version._id ? (
                                                                <Loader2 className="size-3 animate-spin" />
                                                            ) : (
                                                                <GitCompare className="size-3" />
                                                            )}
                                                            <span className="ml-1 hidden sm:inline">Compare</span>
                                                        </Button>
                                                    )}
                                                    {index !== 0 && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="rounded-[0.4rem]"
                                                            onClick={() => handleRestore(version._id)}
                                                            disabled={isRestoring !== null}
                                                        >
                                                            {isRestoring === version._id ? (
                                                                <>
                                                                    <Loader2 className="mr-1 size-3 animate-spin" />
                                                                    Restoring...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <RotateCcw className="mr-1 size-3" />
                                                                    Restore
                                                                </>
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        </>
    );
}
