'use client';

import { useParams } from 'next/navigation';
import { useForm } from '@/hooks/use-forms';
import { useSubmissions } from '@/hooks/use-submissions';
import {
    Button,
    Chip,
    KpiRow,
    Table,
    EmptyState,
    Tabs,
    Card,
    Spinner,
    type TableColumn,
} from '@/components/ui-kit';
import {
    BarChart3,
    Download,
    Eye,
    FileSpreadsheet,
    Globe2,
    Layers3,
    List,
} from 'lucide-react';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { AnalyticsDashboard } from '@/components/forms/analytics-dashboard';
import Link from 'next/link';
import { useAppHeader } from '@/components/app-header';

type SubmissionRow = { _id: string; createdAt: string; data: Record<string, unknown> };

export default function FormSubmissionsPage() {
    const params = useParams();
    const id = params.id as string;
    const { setHeaderInfo } = useAppHeader();
    const [tab, setTab] = useState('data');

    const { form, isLoading: formLoading } = useForm(id);
    const { submissions, isLoading: submissionsLoading, meta } = useSubmissions(id);

    const isLoading = formLoading || submissionsLoading;

    const columns = useMemo(() => {
        if (!submissions || submissions.length === 0) {
            return [];
        }

        const keys = new Set<string>();
        submissions.forEach(sub => {
            if (sub.data) {
                Object.keys(sub.data).forEach(key => keys.add(key));
            }
        });
        return Array.from(keys);
    }, [submissions]);

    useEffect(() => {
        setHeaderInfo({
            type: 'page',
            title: 'Form Responses',
            backHref: `/forms/${id}`,
        });
        return () => setHeaderInfo(null);
    }, [id, setHeaderInfo]);

    const metrics = useMemo(() => {
        const total = meta?.total || 0;
        const avgFields = total
            ? Math.round(
                submissions.reduce((sum, submission) => sum + Object.keys(submission.data || {}).length, 0) / total
            )
            : 0;
        const latestSubmission = submissions[0]?.createdAt
            ? format(new Date(submissions[0].createdAt), 'PP')
            : 'No responses yet';

        return [
            { label: 'Responses', value: total, icon: FileSpreadsheet, pastel: 'violet' as const },
            { label: 'Questions', value: columns.length, icon: Layers3, pastel: 'blue' as const },
            { label: 'Average answers', value: avgFields, icon: BarChart3, pastel: 'mint' as const },
            { label: 'Latest response', value: latestSubmission, icon: Eye, pastel: 'peach' as const },
        ];
    }, [columns.length, meta?.total, submissions]);

    const tableColumns = useMemo<TableColumn<SubmissionRow>[]>(() => {
        return [
            {
                key: 'createdAt',
                label: 'Submitted At',
                width: 200,
                render: (value) => (
                    <span className="text-xs font-medium text-muted-foreground">
                        {format(new Date(value as string), 'PP pp')}
                    </span>
                ),
            },
            ...columns.map((col): TableColumn<SubmissionRow> => ({
                key: col as keyof SubmissionRow & string,
                label: col,
                render: (_value, row) => {
                    const cell = row.data[col];
                    return (
                        <span className="block max-w-[240px] truncate">
                            {typeof cell === 'object' && cell !== null
                                ? JSON.stringify(cell)
                                : cell != null && String(cell) !== '' ? String(cell) : '-'}
                        </span>
                    );
                },
            })),
        ];
    }, [columns]);

    const handleExport = () => {
        if (!submissions || submissions.length === 0) {
            return;
        }

        const headers = ['Submitted At', ...columns, 'IP Address'];
        const rows = submissions.map(sub => {
            const dataValues = columns.map(col => {
                const val = sub.data[col];
                if (typeof val === 'object') {
                    return JSON.stringify(val);
                }
                return `"${val || ''}"`;
            });

            return [
                `"${new Date(sub.createdAt).toLocaleString()}"`,
                ...dataValues,
                `"${sub.metadata?.ip || ''}"`
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${form?.title || 'form'}_submissions.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size={32} />
            </div>
        );
    }

    if (!form) {
        return <div>Form not found</div>;
    }

    return (
        <div className="space-y-5 p-5 pb-8">
            <Card>
                <div className="flex flex-col gap-5 border-b border-border px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip tone={form.isPublished ? 'ok' : 'warn'}>
                                {form.isPublished ? 'Published' : 'Draft'}
                            </Chip>
                            <Chip tone="gray" icon={Globe2}>{form.slug}</Chip>
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{form.title}</h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {meta?.total || 0} total submissions
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <Button variant="outline" icon={Layers3} asChild>
                            <Link href={`/forms/${id}`}>Open builder</Link>
                        </Button>
                        <Button variant="outline" icon={Eye} asChild>
                            <Link href={`/f/${form.slug || id}`} target="_blank">Preview</Link>
                        </Button>
                        <Button
                            variant="outline"
                            icon={Download}
                            onClick={handleExport}
                            disabled={!submissions.length}
                        >
                            Export CSV
                        </Button>
                    </div>
                </div>

                <div className="px-5 py-4">
                    <KpiRow cols={4} items={metrics} />
                </div>
            </Card>

            <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                    { value: 'data', label: <span className="flex items-center gap-2"><List className="size-4" /> Data</span> },
                    { value: 'analytics', label: <span className="flex items-center gap-2"><BarChart3 className="size-4" /> Analytics</span> },
                ]}
            />

            {tab === 'data' ? (
                <div className="mt-4">
                    {submissions.length === 0 ? (
                        <EmptyState
                            icon={FileSpreadsheet}
                            title="No submissions yet"
                            note="Responses will appear here as soon as this form starts receiving entries."
                        />
                    ) : (
                        <Card
                            title="Submission table"
                            meta={`${submissions.length} rows, ${columns.length} dynamic fields`}
                        >
                            <Table<SubmissionRow>
                                columns={tableColumns}
                                rows={submissions as SubmissionRow[]}
                                rowKey="_id"
                            />
                        </Card>
                    )}
                </div>
            ) : (
                <div className="mt-4">
                    <AnalyticsDashboard formId={id} />
                </div>
            )}
        </div>
    );
}
