import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BarChart3, ExternalLink, Eye, FileText, Loader2, Send, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Form {
    _id: string;
    title: string;
    content?: string;
    slug?: string;
    isPublished: boolean;
    views?: number;
    submissionsCount?: number;
    settings?: {
        description?: string;
        submitButtonText?: string;
    };
}

interface FormSubmission {
    _id: string;
    data: Record<string, unknown>;
    createdAt: string;
}

interface FormSubmissionMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface FieldInsight {
    field: string;
    responseCount: number;
    topValues: Array<{
        label: string;
        count: number;
    }>;
}

function humanizeFieldLabel(field: string) {
    return field
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSubmissionValue(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        const normalized = value
            .map((item) => normalizeSubmissionValue(item))
            .filter((item): item is string => Boolean(item));

        return normalized.length ? normalized.join(', ') : null;
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const preferred = ['label', 'title', 'name', 'value']
            .map((key) => record[key])
            .find((candidate) => typeof candidate === 'string' && candidate.trim().length);

        if (typeof preferred === 'string') {
            return preferred.trim();
        }

        const serialized = JSON.stringify(value);
        return serialized === '{}' ? null : serialized;
    }

    return null;
}

function buildFieldInsights(submissions: FormSubmission[]) {
    const fieldMap = new Map<string, { responseCount: number; values: Map<string, number> }>();

    submissions.forEach((submission) => {
        Object.entries(submission.data || {}).forEach(([field, rawValue]) => {
            const normalizedValue = normalizeSubmissionValue(rawValue);
            if (!normalizedValue) {
                return;
            }

            const existing = fieldMap.get(field) || {
                responseCount: 0,
                values: new Map<string, number>(),
            };

            existing.responseCount += 1;
            existing.values.set(
                normalizedValue,
                (existing.values.get(normalizedValue) || 0) + 1
            );

            fieldMap.set(field, existing);
        });
    });

    return Array.from(fieldMap.entries())
        .map<FieldInsight>(([field, value]) => ({
            field,
            responseCount: value.responseCount,
            topValues: Array.from(value.values.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([label, count]) => ({ label, count })),
        }))
        .sort((a, b) => b.responseCount - a.responseCount)
        .slice(0, 4);
}

function SubmissionPreview({ submission }: { submission: FormSubmission }) {
    const fields = Object.entries(submission.data || {}).slice(0, 4);

    return (
        <div className="rounded-[12px] border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {new Date(submission.createdAt).toLocaleString()}
                </p>
                <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-[0.16em]">
                    {fields.length} field{fields.length === 1 ? '' : 's'}
                </Badge>
            </div>

            <div className="mt-3 space-y-2">
                {fields.map(([field, value]) => (
                    <div key={field} className="flex items-start justify-between gap-3 text-sm">
                        <span className="max-w-[45%] text-muted-foreground">
                            {humanizeFieldLabel(field)}
                        </span>
                        <span className="max-w-[55%] text-right text-foreground">
                            {normalizeSubmissionValue(value) || 'No answer'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export const FormEmbedNode = Node.create({
    name: 'formEmbed',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            formId: {
                default: null,
            },
            title: {
                default: '',
            },
            displayMode: {
                default: 'form',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'form-embed',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['form-embed', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const [forms, setForms] = useState<Form[]>([]);
            const [loading, setLoading] = useState(false);
            const [formContent, setFormContent] = useState<Form | null>(null);
            const [formLoading, setFormLoading] = useState(false);
            const [formError, setFormError] = useState<string | null>(null);
            const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
            const [submissionsMeta, setSubmissionsMeta] = useState<FormSubmissionMeta | null>(null);
            const [submissionsLoading, setSubmissionsLoading] = useState(false);

            useEffect(() => {
                if (isEditable && !node.attrs.formId) {
                    setLoading(true);
                    fetch('/api/v2/forms')
                        .then((res) => res.json())
                        .then((data) => {
                            if (Array.isArray(data)) {
                                setForms(data);
                            } else if (data.forms) {
                                setForms(data.forms);
                            }
                        })
                        .catch((error) => console.error(error))
                        .finally(() => setLoading(false));
                }
            }, [isEditable, node.attrs.formId]);

            useEffect(() => {
                const fetchFormContent = async () => {
                    if (!node.attrs.formId) {
                        setFormContent(null);
                        return;
                    }

                    setFormLoading(true);
                    setFormError(null);

                    try {
                        let response = await fetch(`/api/v2/forms/${node.attrs.formId}`);

                        if (response.status === 401) {
                            response = await fetch(`/api/public/forms/${node.attrs.formId}`);
                        }

                        if (!response.ok) {
                            if (response.status === 404) {
                                throw new Error('Form not found or not published');
                            }

                            throw new Error('Failed to load form');
                        }

                        const data = await response.json();
                        setFormContent(data);
                    } catch (error) {
                        console.error('Error loading form:', error);
                        setFormError(
                            error instanceof Error ? error.message : 'Error loading form'
                        );
                    } finally {
                        setFormLoading(false);
                    }
                };

                fetchFormContent();
            }, [node.attrs.formId]);

            useEffect(() => {
                const shouldFetchSubmissions =
                    Boolean(node.attrs.formId) &&
                    (node.attrs.displayMode === 'summary' || node.attrs.displayMode === 'responses');

                if (!shouldFetchSubmissions) {
                    setSubmissions([]);
                    setSubmissionsMeta(null);
                    return;
                }

                const fetchSubmissions = async () => {
                    setSubmissionsLoading(true);

                    try {
                        const limit = node.attrs.displayMode === 'responses' ? 8 : 25;
                        const response = await fetch(
                            `/api/v2/forms/${node.attrs.formId}/submissions?limit=${limit}`
                        );

                        if (!response.ok) {
                            return;
                        }

                        const data = await response.json();
                        setSubmissions(data.data || []);
                        setSubmissionsMeta(data.meta || null);
                    } catch (error) {
                        console.error('Error loading recent submissions:', error);
                    } finally {
                        setSubmissionsLoading(false);
                    }
                };

                fetchSubmissions();
            }, [node.attrs.displayMode, node.attrs.formId]);

            const handleSelect = (formId: string) => {
                const form = forms.find((item) => item._id === formId);
                if (form) {
                    updateAttributes({ formId, title: form.title });
                }
            };

            const clearSelection = () => {
                updateAttributes({ formId: null, title: '', displayMode: 'form' });
                setFormContent(null);
                setSubmissions([]);
                setSubmissionsMeta(null);
            };

            const recentSubmissions = submissions.slice(0, 3);
            const fieldInsights = buildFieldInsights(submissions);
            const publicFormPath = formContent ? `/f/${formContent.slug || node.attrs.formId}` : null;

            if (!node.attrs.formId && isEditable) {
                return (
                    <NodeViewWrapper className="my-4">
                        <Card className="mx-auto w-full max-w-md border-dashed">
                            <CardContent className="flex flex-col items-center gap-4 p-6">
                                <div className="flex flex-col items-center gap-2 text-center">
                                    <div className="rounded-full bg-primary/10 p-3">
                                        <FileText className="size-6 text-primary" />
                                    </div>
                                    <h3 className="font-semibold">Embed a Form</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Select a form to display in this note.
                                    </p>
                                </div>

                                {loading ? (
                                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                ) : (
                                    <Select onValueChange={handleSelect}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select a form..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {forms.map((form) => (
                                                <SelectItem key={form._id} value={form._id}>
                                                    {form.title} {form.isPublished ? '(Published)' : '(Draft)'}
                                                </SelectItem>
                                            ))}
                                            {forms.length === 0 && (
                                                <div className="p-2 text-center text-sm text-muted-foreground">
                                                    No forms found
                                                </div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={deleteNode}
                                    className="text-muted-foreground"
                                >
                                    Cancel
                                </Button>
                            </CardContent>
                        </Card>
                    </NodeViewWrapper>
                );
            }

            return (
                <NodeViewWrapper className="group relative my-6">
                    {isEditable && (
                        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                                variant="secondary"
                                size="icon"
                                className="size-8 shadow-sm"
                                onClick={clearSelection}
                                title="Change Form"
                            >
                                <X className="size-4" />
                            </Button>
                            <Button
                                variant="destructive"
                                size="icon"
                                className="size-8 shadow-sm"
                                onClick={deleteNode}
                                title="Remove"
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    )}

                    <Card className="overflow-hidden border-primary/20 bg-background/50 backdrop-blur-sm">
                        <div className="flex items-center justify-between gap-4 border-b bg-muted/30 p-3">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md border bg-background p-1.5 shadow-sm">
                                    <FileText className="size-4 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium leading-none">
                                        {node.attrs.title || 'Untitled Form'}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        {node.attrs.displayMode === 'summary'
                                            ? 'Form Summary'
                                            : node.attrs.displayMode === 'responses'
                                                ? 'Latest Submissions'
                                                : 'Live Form'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {isEditable && node.attrs.formId ? (
                                    <Select
                                        value={node.attrs.displayMode || 'form'}
                                        onValueChange={(value) => updateAttributes({ displayMode: value })}
                                    >
                                        <SelectTrigger className="h-8 w-[160px] text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="form">Live form</SelectItem>
                                            <SelectItem value="summary">Summary</SelectItem>
                                            <SelectItem value="responses">Latest submissions</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}

                                {node.attrs.formId ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => window.open(`/forms/${node.attrs.formId}`, '_blank')}
                                    >
                                        <ExternalLink className="mr-2 size-3.5" />
                                        Open form
                                    </Button>
                                ) : null}
                            </div>
                        </div>

                        <div className="relative min-h-[150px] p-4 md:p-6">
                            {(formLoading || submissionsLoading) && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                                    <Loader2 className="size-6 animate-spin text-primary" />
                                </div>
                            )}

                            {formError ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                                    <AlertCircle className="size-8 text-destructive/50" />
                                    <p>Unable to load form.</p>
                                    <p className="text-xs opacity-70">{formError}</p>
                                </div>
                            ) : formContent ? (
                                <div className="space-y-5">
                                    {node.attrs.displayMode === 'summary' ? (
                                        <>
                                            <div className="space-y-1">
                                                <p className="text-base font-semibold text-foreground">
                                                    {formContent.title}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {formContent.settings?.description ||
                                                        'Use this form inside the note, or jump into Forms to edit fields and logic.'}
                                                </p>
                                            </div>

                                            <div className="grid gap-3 sm:grid-cols-3">
                                                <div className="rounded-[12px] border bg-background p-3">
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <Eye className="size-3.5" />
                                                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                                                            Views
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xl font-semibold text-foreground">
                                                        {formContent.views || 0}
                                                    </p>
                                                </div>
                                                <div className="rounded-[12px] border bg-background p-3">
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <Send className="size-3.5" />
                                                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                                                            Submissions
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xl font-semibold text-foreground">
                                                        {formContent.submissionsCount || 0}
                                                    </p>
                                                </div>
                                                <div className="rounded-[12px] border bg-background p-3">
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <BarChart3 className="size-3.5" />
                                                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                                                            Status
                                                        </span>
                                                    </div>
                                                    <div className="mt-2">
                                                        <Badge
                                                            variant={formContent.isPublished ? 'default' : 'secondary'}
                                                        >
                                                            {formContent.isPublished ? 'Published' : 'Draft'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <Button size="sm" asChild>
                                                    <Link href={`/forms/${node.attrs.formId}`}>
                                                        Open form editor
                                                    </Link>
                                                </Button>
                                                {formContent.isPublished && publicFormPath ? (
                                                    <Button size="sm" variant="outline" asChild>
                                                        <Link href={publicFormPath} target="_blank">
                                                            Open public form
                                                        </Link>
                                                    </Button>
                                                ) : null}
                                                <Button size="sm" variant="outline" asChild>
                                                    <Link href={`/forms/${node.attrs.formId}/submissions`}>
                                                        Open submissions
                                                    </Link>
                                                </Button>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-foreground">
                                                        Response signals
                                                    </p>
                                                    <span className="text-xs text-muted-foreground">
                                                        Based on the latest {submissionsMeta?.total || submissions.length}{' '}
                                                        response{(submissionsMeta?.total || submissions.length) === 1 ? '' : 's'}
                                                    </span>
                                                </div>

                                                {fieldInsights.length ? (
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        {fieldInsights.map((insight) => (
                                                            <div
                                                                key={insight.field}
                                                                className="rounded-[12px] border bg-background p-3"
                                                            >
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <p className="text-sm font-semibold text-foreground">
                                                                        {humanizeFieldLabel(insight.field)}
                                                                    </p>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {insight.responseCount} answers
                                                                    </span>
                                                                </div>
                                                                <div className="mt-3 flex flex-wrap gap-2">
                                                                    {insight.topValues.map((value) => (
                                                                        <span
                                                                            key={`${insight.field}-${value.label}`}
                                                                            className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-foreground"
                                                                        >
                                                                            {value.label} ({value.count})
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-[12px] border border-dashed bg-background px-3 py-4 text-sm text-muted-foreground">
                                                        Field-level response patterns will appear here once submissions start coming in.
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-foreground">
                                                        Recent submissions
                                                    </p>
                                                    <span className="text-xs text-muted-foreground">
                                                        {recentSubmissions.length
                                                            ? `${recentSubmissions.length} shown`
                                                            : 'No submissions yet'}
                                                    </span>
                                                </div>

                                                {recentSubmissions.length ? (
                                                    <div className="space-y-3">
                                                        {recentSubmissions.map((submission) => (
                                                            <SubmissionPreview
                                                                key={submission._id}
                                                                submission={submission}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-[12px] border border-dashed bg-background px-3 py-4 text-sm text-muted-foreground">
                                                        New responses will show up here so the note can double as a lightweight response tracker.
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : node.attrs.displayMode === 'responses' ? (
                                        <>
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="space-y-1">
                                                    <p className="text-base font-semibold text-foreground">
                                                        Latest submissions
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Keep recent form activity visible inside the note without leaving Docs.
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge variant="outline" className="rounded-full">
                                                        {submissionsMeta?.total || formContent.submissionsCount || 0}{' '}
                                                        total
                                                    </Badge>
                                                    <Button size="sm" variant="outline" asChild>
                                                        <Link href={`/forms/${node.attrs.formId}/submissions`}>
                                                            Open submissions
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>

                                            {submissions.length ? (
                                                <div className="space-y-3">
                                                    {submissions.map((submission) => (
                                                        <SubmissionPreview
                                                            key={submission._id}
                                                            submission={submission}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="rounded-[12px] border border-dashed bg-background px-3 py-5 text-sm text-muted-foreground">
                                                    No submissions yet. As responses arrive, this block becomes a live feed inside the note.
                                                </div>
                                            )}
                                        </>
                                    ) : formContent.isPublished && publicFormPath ? (
                                        <div className="space-y-3">
                                            <div className="overflow-hidden rounded-[14px] border bg-background">
                                                <iframe
                                                    src={publicFormPath}
                                                    title={`Live form: ${formContent.title}`}
                                                    className="h-[760px] w-full bg-white"
                                                    loading="lazy"
                                                />
                                            </div>
                                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <ExternalLink className="size-3.5" />
                                                Live embeds use the published public form route so the form stays interactive inside notes.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="rounded-[16px] border border-dashed bg-muted/20 p-5">
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="space-y-2">
                                                    <Badge variant="secondary" className="rounded-full">
                                                        Publish required
                                                    </Badge>
                                                    <div>
                                                        <p className="text-base font-semibold text-foreground">
                                                            Live form embed is unavailable while this form is a draft.
                                                        </p>
                                                        <p className="mt-1 text-sm text-muted-foreground">
                                                            Publish the form to render the interactive public version here. Until then, use Summary or Latest submissions mode.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <Button size="sm" asChild>
                                                        <Link href={`/forms/${node.attrs.formId}`}>
                                                            Open form editor
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => updateAttributes({ displayMode: 'summary' })}
                                                    >
                                                        Switch to summary
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </Card>
                </NodeViewWrapper>
            );
        });
    },
});
