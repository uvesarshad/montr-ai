'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, ExternalLink, Loader2, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface FormEntry {
    _id: string;
    title: string;
    slug: string;
    isPublished: boolean;
    submissionsCount: number;
    submissionCount: number;
    createdAt: string;
    updatedAt: string;
    latestSubmission: {
        _id: string;
        data: Record<string, unknown>;
        createdAt: string;
    } | null;
}

export function ContactFormsTab({ contactId }: { contactId: string }) {
    const { data, isLoading: loading } = useQuery<FormEntry[]>({
        queryKey: ['crm', 'contact', contactId, 'forms'],
        queryFn: async () => {
            const res = await fetch(`/api/v2/crm/contacts/${contactId}/forms`);
            const data = await res.json();
            return data.forms ?? [];
        },
    });
    const forms = data ?? [];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (forms.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed bg-muted/20 py-12 text-center">
                <Inbox className="size-10 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium">No form submissions found</p>
                <p className="text-xs text-muted-foreground">
                    Submissions matching this contact&apos;s email will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {forms.map(form => (
                <div key={form._id} className="rounded-[12px] border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-primary/15 bg-primary/10 text-primary">
                                <FileText className="size-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{form.title}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant={form.isPublished ? 'default' : 'secondary'} className="text-[11px]">
                                        {form.isPublished ? 'Published' : 'Draft'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {form.submissionCount} submission{form.submissionCount !== 1 ? 's' : ''} from this contact
                                    </span>
                                </div>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
                            <Link href={`/forms/${form._id}`} target="_blank">
                                <ExternalLink className="size-3.5" />
                            </Link>
                        </Button>
                    </div>

                    {form.latestSubmission && (
                        <div className="mt-3 rounded-[8px] border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                Latest submission · {formatDistanceToNow(new Date(form.latestSubmission.createdAt), { addSuffix: true })}
                            </p>
                            <div className="space-y-1">
                                {Object.entries(form.latestSubmission.data)
                                    .filter(([k]) => !k.startsWith('_'))
                                    .slice(0, 4)
                                    .map(([key, value]) => (
                                        <div key={key} className="flex gap-2 text-xs">
                                            <span className="w-24 shrink-0 truncate font-medium text-muted-foreground">{key}</span>
                                            <span className="truncate">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
