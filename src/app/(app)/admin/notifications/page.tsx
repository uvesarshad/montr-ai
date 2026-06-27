// OSS single-tenant override of src/app/(app)/admin/notifications/page.tsx — generated CP-2 hand-patch; org-stripped, userId-scoped.
'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { Megaphone, Users2, History, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
    Button,
    Chip,
    Tabs,
    Input,
    Skeleton,
    Card,
    EmptyState,
    Field,
    Select,
    Textarea,
    PageHeader,
    type ChipTone,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { useAppHeader } from '@/components/app-header';

type AudienceType = 'all' | 'role';

interface BroadcastRecord {
    _id: string;
    title: string;
    body?: string;
    severity: string;
    audienceLabel: string;
    deliveredCount: number;
    createdByName?: string;
    createdAt: string;
}

const SEVERITY_TONE: Record<string, ChipTone> = {
    info: 'info',
    success: 'ok',
    warning: 'warn',
    error: 'danger',
    critical: 'danger',
};

interface ComposeState {
    title: string;
    body: string;
    severity: string;
    actionUrl: string;
    actionLabel: string;
    audienceType: AudienceType;
    targetRole: string;
}

const initialComposeState: ComposeState = {
    title: '',
    body: '',
    severity: 'info',
    actionUrl: '',
    actionLabel: '',
    audienceType: 'all',
    targetRole: 'user',
};

type ComposeAction =
    | { type: 'setField'; field: keyof ComposeState; value: string }
    | { type: 'resetAfterSend' };

function composeReducer(state: ComposeState, action: ComposeAction): ComposeState {
    switch (action.type) {
        case 'setField':
            return { ...state, [action.field]: action.value };
        case 'resetAfterSend':
            return { ...state, title: '', body: '', actionUrl: '', actionLabel: '' };
        default:
            return state;
    }
}

export default function AdminBroadcastPage() {
    const { data: session } = useSession();
    const role = (session?.user as { role?: string } | undefined)?.role;
    const { toast } = useToast();
    const { setHeaderInfo } = useAppHeader();

    const [tab, setTab] = useState('compose');
    const [compose, dispatchCompose] = useReducer(composeReducer, initialComposeState);
    const { title, body, severity, actionUrl, actionLabel, audienceType, targetRole } = compose;
    const [sending, setSending] = useState(false);

    const [history, setHistory] = useState<BroadcastRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);

    useEffect(() => {
        setHeaderInfo({ type: 'page', title: 'Broadcast notification' });
        return () => setHeaderInfo(null);
    }, [setHeaderInfo]);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch('/api/v2/notifications/admin/broadcast');
            if (res.ok) {
                const data = await res.json();
                setHistory(data.data ?? []);
            }
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        if (role === 'super_admin') void loadHistory();
    }, [role, loadHistory]);

    if (session && role !== 'super_admin') {
        return (
            <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted-foreground">
                This page is restricted to super admins.
            </div>
        );
    }

    const send = async () => {
        if (!title.trim()) {
            toast({ variant: 'destructive', title: 'Title required' });
            return;
        }
        const audience =
            audienceType === 'role'
                ? { type: 'role', role: targetRole }
                : { type: 'all' };

        setSending(true);
        try {
            const res = await fetch('/api/v2/notifications/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    body: body.trim() || undefined,
                    severity,
                    actionUrl: actionUrl.trim() || undefined,
                    actionLabel: actionLabel.trim() || undefined,
                    audience,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                toast({ title: 'Broadcast sent', description: `Delivered to ${data.delivered} user(s).` });
                dispatchCompose({ type: 'resetAfterSend' });
                void loadHistory();
                setTab('history');
            } else {
                toast({ variant: 'destructive', title: 'Failed', description: data.error || 'Could not send broadcast.' });
            }
        } catch (err) {
            toast({ variant: 'destructive', title: 'Failed', description: String(err) });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
            <PageHeader
                icon={Megaphone}
                title="Notification broadcasts"
                sub="Send announcements to users and review what's been sent."
                className="mb-6"
            />

            <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                    { value: 'compose', label: <span className="flex items-center gap-1.5"><Send className="size-3.5" /> Compose</span> },
                    { value: 'history', label: <span className="flex items-center gap-1.5"><History className="size-3.5" /> History</span> },
                ]}
            />

            {tab === 'compose' ? (
                <Card bodyClassName="p-5" className="mt-4">
                <div className="space-y-5">
                    <Field label="Title" htmlFor="title">
                        <Input id="title" value={title} onChange={(e) => dispatchCompose({ type: 'setField', field: 'title', value: e.target.value })} placeholder="What's new" />
                    </Field>

                    <Field label="Message" htmlFor="body">
                        <Textarea id="body" value={body} onChange={(e) => dispatchCompose({ type: 'setField', field: 'body', value: e.target.value })} rows={4} placeholder="Tell users about the update…" />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Severity">
                            <Select
                                value={severity}
                                onChange={(v) => dispatchCompose({ type: 'setField', field: 'severity', value: v })}
                                options={[
                                    { value: 'info', label: 'Info' },
                                    { value: 'success', label: 'Success' },
                                    { value: 'warning', label: 'Warning' },
                                    { value: 'error', label: 'Error' },
                                    { value: 'critical', label: 'Critical' },
                                ]}
                            />
                        </Field>
                        <Field label="Audience">
                            <Select
                                value={audienceType}
                                onChange={(v) => dispatchCompose({ type: 'setField', field: 'audienceType', value: v })}
                                options={[
                                    { value: 'all', label: 'All users' },
                                    { value: 'role', label: 'By role' },
                                ]}
                            />
                        </Field>
                    </div>

                    {audienceType === 'role' && (
                        <Field label="Role">
                            <Select
                                value={targetRole}
                                onChange={(v) => dispatchCompose({ type: 'setField', field: 'targetRole', value: v })}
                                options={[
                                    { value: 'user', label: 'Users' },
                                    { value: 'admin', label: 'Admins' },
                                    { value: 'super_admin', label: 'Super admins' },
                                ]}
                            />
                        </Field>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Action link (optional)" htmlFor="actionUrl">
                            <Input id="actionUrl" value={actionUrl} onChange={(e) => dispatchCompose({ type: 'setField', field: 'actionUrl', value: e.target.value })} placeholder="https://…" />
                        </Field>
                        <Field label="Action label (optional)" htmlFor="actionLabel">
                            <Input id="actionLabel" value={actionLabel} onChange={(e) => dispatchCompose({ type: 'setField', field: 'actionLabel', value: e.target.value })} placeholder="Learn more" />
                        </Field>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="brand" icon={Megaphone} onClick={send} disabled={sending}>
                            {sending ? 'Sending…' : 'Send broadcast'}
                        </Button>
                    </div>
                </div>
                </Card>
            ) : (
                <div className="mt-4">
                    {historyLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={`skeleton-${i}`} className="h-20 w-full" />
                            ))}
                        </div>
                    ) : history.length === 0 ? (
                        <EmptyState icon={History} title="No broadcasts yet" note="No broadcasts have been sent yet." />
                    ) : (
                        <div className="space-y-3">
                            {history.map((b) => (
                                <Card key={b._id} bodyClassName="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Chip tone={SEVERITY_TONE[b.severity] ?? 'info'}>{b.severity}</Chip>
                                                <p className="truncate text-sm font-semibold">{b.title}</p>
                                            </div>
                                            {b.body && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.body}</p>}
                                        </div>
                                        <Chip tone="gray" icon={Users2}>{b.deliveredCount}</Chip>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                                        <span>{b.audienceLabel}</span>
                                        <span>·</span>
                                        <span>
                                            {(() => {
                                                try {
                                                    return formatDistanceToNow(new Date(b.createdAt), { addSuffix: true });
                                                } catch {
                                                    return '';
                                                }
                                            })()}
                                        </span>
                                        {b.createdByName && (
                                            <>
                                                <span>·</span>
                                                <span>by {b.createdByName}</span>
                                            </>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
