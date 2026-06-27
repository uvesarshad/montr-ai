'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MapPin, RefreshCw, UserPlus, Webhook } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    Button,
    Chip,
    CopyField,
    DataTable,
    Field,
    FormDialog,
    PageHeader,
    Card,
    Select,
    type ChipTone,
    type DataTableColumn,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import {
    PLATFORM_LABELS,
    fetchAdAccounts,
    type AdAccountDto,
    type AdLeadDto,
    type AdsPlatform,
} from './ads-data';

const STATUS_TONES: Record<AdLeadDto['status'], ChipTone> = {
    received: 'info',
    synced: 'ok',
    failed: 'danger',
    skipped: 'gray',
};

type StatusFilter = 'all' | AdLeadDto['status'];

interface FieldMapDto {
    platform: AdsPlatform;
    formId: string;
    fieldMap: { firstName?: string; lastName?: string; email?: string; phone?: string };
}

const IDENTITY_SLOTS = [
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'firstName', label: 'First name' },
    { key: 'lastName', label: 'Last name' },
] as const;

interface FormSeen {
    platform: AdsPlatform;
    formId: string;
    keys: Set<string>;
    count: number;
}

function FormMappingSection({
    formsSeen,
    fieldMaps,
    onMap,
}: {
    formsSeen: FormSeen[];
    fieldMaps: FieldMapDto[];
    onMap: (form: { platform: AdsPlatform; formId: string; keys: Set<string> }) => void;
}) {
    return (
        <Card icon={MapPin} title="Field mapping">
            <p className="mb-3 text-sm text-muted-foreground">
                Standard fields (email, phone, name) map automatically. Forms with custom question keys
                can be mapped here — then retry any failed leads.
            </p>
            <div className="divide-y divide-border">
                {formsSeen.map((form) => {
                    const mapped = fieldMaps.some((map) => map.platform === form.platform && map.formId === form.formId);
                    return (
                        <div key={`${form.platform}:${form.formId}`} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                                <Chip tone={form.platform === 'meta_ads' ? 'info' : 'purple'}>
                                    {PLATFORM_LABELS[form.platform]}
                                </Chip>
                                <span className="truncate text-sm font-medium">Form {form.formId}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{form.count} lead{form.count === 1 ? '' : 's'}</span>
                                {mapped && <Chip tone="ok">Mapped</Chip>}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => onMap(form)}>
                                {mapped ? 'Edit mapping' : 'Map fields'}
                            </Button>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

function LeadCaptureSetup({ appUrl, googleAccounts }: { appUrl: string; googleAccounts: AdAccountDto[] }) {
    return (
        <Card icon={Webhook} title="Lead capture setup">
            <div className="space-y-5 text-sm">
                <div className="space-y-2">
                    <h4 className="font-semibold">Meta Lead Ads</h4>
                    <p className="text-muted-foreground">
                        Leads flow in automatically once the Meta App subscribes to the <code className="rounded bg-muted px-1">leadgen</code> webhook
                        and your Facebook Page or Meta ad account is connected. Webhook URL for the Meta App dashboard:
                    </p>
                    <CopyField value={`${appUrl}/api/webhooks/meta-leads`} />
                </div>

                <div className="space-y-2">
                    <h4 className="font-semibold">Google Ads lead forms</h4>
                    <p className="text-muted-foreground">
                        In your lead form asset, set the webhook URL below and use the connected account&apos;s Google key.
                    </p>
                    <CopyField value={`${appUrl}/api/webhooks/google-leads`} />
                    {googleAccounts.length === 0 ? (
                        <p className="text-muted-foreground">Connect a Google Ads account to get a Google key.</p>
                    ) : (
                        googleAccounts.map((account) => (
                            <Field key={account._id} label={`Google key — ${account.accountName} (${account.externalAccountId})`}>
                                <CopyField value={account.webhookKey!} secret />
                            </Field>
                        ))
                    )}
                </div>
            </div>
        </Card>
    );
}

export function AdsLeads() {
    const { currentBrandId } = useCurrentBrand();
    const { toast } = useToast();

    const [leads, setLeads] = useState<AdLeadDto[]>([]);
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
    const [googleAccounts, setGoogleAccounts] = useState<AdAccountDto[]>([]);
    const [status, setStatus] = useState<StatusFilter>('all');
    const [loading, setLoading] = useState(true);
    const [retryingId, setRetryingId] = useState<string | null>(null);

    // Per-form field mapping
    const [fieldMaps, setFieldMaps] = useState<FieldMapDto[]>([]);
    const [mappingForm, setMappingForm] = useState<{ platform: AdsPlatform; formId: string; keys: string[] } | null>(null);
    const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});

    const load = useCallback(async (statusFilter: StatusFilter) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '100' });
            if (currentBrandId) params.set('brandId', currentBrandId);
            if (statusFilter !== 'all') params.set('status', statusFilter);

            const [leadsRes, accountsRes, mapsRes] = await Promise.all([
                fetch(`/api/v2/ads/leads?${params}`),
                fetchAdAccounts(currentBrandId),
                fetch('/api/v2/ads/lead-field-maps'),
            ]);

            if (leadsRes.ok) {
                const data = await leadsRes.json();
                setLeads(data.leads || []);
                setStatusCounts(data.statusCounts || {});
            }
            if (mapsRes.ok) {
                const data = await mapsRes.json();
                setFieldMaps(data.maps || []);
            }
            setGoogleAccounts((accountsRes?.accounts || []).filter((account) => account.platform === 'google_ads' && account.webhookKey));
        } finally {
            setLoading(false);
        }
    }, [currentBrandId]);

    useEffect(() => { load(status); }, [load, status]);

    const handleRetry = useCallback(async (lead: AdLeadDto) => {
        setRetryingId(lead._id);
        try {
            const response = await fetch(`/api/v2/ads/leads/${lead._id}/retry`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Retry failed');

            if (data.status === 'synced') {
                toast({ title: 'Lead synced to CRM' });
            } else {
                toast({ variant: 'destructive', title: `Lead ${data.status}`, description: 'Check the lead error for details.' });
            }
            load(status);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Retry failed';
            toast({ variant: 'destructive', title: 'Retry failed', description: message });
        } finally {
            setRetryingId(null);
        }
    }, [load, status, toast]);

    const columns: DataTableColumn<AdLeadDto>[] = useMemo(() => [
        {
            id: 'lead',
            header: 'Lead',
            cell: ({ row }) => {
                const lead = row.original;
                const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
                return (
                    <div className="min-w-0">
                        <span className="block truncate text-sm font-medium">{name || lead.email || lead.phone || '—'}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                            {[lead.email, lead.phone].filter(Boolean).join(' · ')}
                        </span>
                    </div>
                );
            },
        },
        {
            accessorKey: 'platform',
            header: 'Platform',
            cell: ({ row }) => (
                <Chip tone={row.original.platform === 'meta_ads' ? 'info' : 'purple'}>
                    {PLATFORM_LABELS[row.original.platform as AdsPlatform]}
                </Chip>
            ),
        },
        {
            accessorKey: 'campaignName',
            header: 'Campaign',
            cell: ({ row }) => (
                <span className="block max-w-[180px] truncate text-sm">
                    {row.original.campaignName || row.original.campaignId || '—'}
                </span>
            ),
        },
        {
            accessorKey: 'status',
            header: 'CRM status',
            cell: ({ row }) => {
                const lead = row.original;
                return (
                    <div className="min-w-0">
                        <Chip tone={STATUS_TONES[lead.status]} dot>{lead.status}</Chip>
                        {lead.error && (
                            <span className="mt-0.5 block max-w-[220px] truncate text-xs text-danger" title={lead.error}>
                                {lead.error}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'receivedAt',
            header: 'Received',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(row.original.receivedAt), 'MMM d, HH:mm')}
                </span>
            ),
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => {
                const lead = row.original;
                if (lead.status === 'synced' && lead.contactId) {
                    return (
                        <Button variant="ghost" size="sm" asChild>
                            <a href={`/crm/contacts/${lead.contactId}`}>View contact</a>
                        </Button>
                    );
                }
                return (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={retryingId !== null}
                        onClick={() => handleRetry(lead)}
                    >
                        {retryingId === lead._id ? 'Retrying…' : 'Retry sync'}
                    </Button>
                );
            },
        },
    ], [handleRetry, retryingId]);

    /* ── per-form field mapping ───────────────────────────────────────── */
    const formsSeen = useMemo(() => {
        const byForm = new Map<string, { platform: AdsPlatform; formId: string; keys: Set<string>; count: number }>();
        for (const lead of leads) {
            if (!lead.formId) continue;
            const key = `${lead.platform}:${lead.formId}`;
            const entry = byForm.get(key) || { platform: lead.platform, formId: lead.formId, keys: new Set<string>(), count: 0 };
            Object.keys(lead.fields || {}).forEach((fieldKey) => entry.keys.add(fieldKey));
            entry.count += 1;
            byForm.set(key, entry);
        }
        return Array.from(byForm.values());
    }, [leads]);

    const openMappingDialog = useCallback((form: { platform: AdsPlatform; formId: string; keys: Set<string> }) => {
        const existing = fieldMaps.find((map) => map.platform === form.platform && map.formId === form.formId);
        setMappingDraft({
            email: existing?.fieldMap.email || '',
            phone: existing?.fieldMap.phone || '',
            firstName: existing?.fieldMap.firstName || '',
            lastName: existing?.fieldMap.lastName || '',
        });
        setMappingForm({ platform: form.platform, formId: form.formId, keys: Array.from(form.keys).sort() });
    }, [fieldMaps]);

    const saveMapping = useCallback(async () => {
        if (!mappingForm) return;
        const fieldMap = Object.fromEntries(
            Object.entries(mappingDraft).filter(([, value]) => value),
        );
        const response = await fetch('/api/v2/ads/lead-field-maps', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: mappingForm.platform, formId: mappingForm.formId, fieldMap }),
        });
        const data = await response.json();
        if (!response.ok) {
            toast({ variant: 'destructive', title: 'Could not save mapping', description: data.error });
            throw new Error(data.error || 'save failed');
        }
        setFieldMaps((previous) => [
            data,
            ...previous.filter((map) => !(map.platform === data.platform && map.formId === data.formId)),
        ]);
        toast({ title: 'Mapping saved', description: 'Retry failed leads to re-run them with the new mapping.' });
    }, [mappingForm, mappingDraft, toast]);

    const filters: { value: StatusFilter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'synced', label: `Synced${statusCounts.synced ? ` (${statusCounts.synced})` : ''}` },
        { value: 'failed', label: `Failed${statusCounts.failed ? ` (${statusCounts.failed})` : ''}` },
        { value: 'skipped', label: `Skipped${statusCounts.skipped ? ` (${statusCounts.skipped})` : ''}` },
        { value: 'received', label: 'Received' },
    ];

    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                icon={UserPlus}
                title="Ad Leads"
                sub="Leads captured from Meta Lead Ads and Google lead forms, synced into your CRM"
                actions={
                    <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => load(status)}>
                        Refresh
                    </Button>
                }
            />

            <div className="flex flex-wrap gap-1.5">
                {filters.map((filter) => (
                    <Chip
                        key={filter.value}
                        tone={status === filter.value ? 'brand' : 'gray'}
                        selected={status === filter.value}
                        onClick={() => setStatus(filter.value)}
                    >
                        {filter.label}
                    </Chip>
                ))}
            </div>

            <DataTable
                columns={columns}
                data={leads}
                loading={loading}
                getRowId={(row) => row._id}
                emptyTitle="No leads captured yet"
                emptyNote="Set up the lead webhooks below — new leads land here and sync into the CRM automatically."
                mobileCard={(lead) => (
                    <div className="space-y-1 rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                                {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || '—'}
                            </span>
                            <Chip tone={STATUS_TONES[lead.status]} dot>{lead.status}</Chip>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {PLATFORM_LABELS[lead.platform as AdsPlatform]} · {lead.campaignName || 'Unknown campaign'} · {format(new Date(lead.receivedAt), 'MMM d')}
                        </div>
                    </div>
                )}
            />

            {/* Per-form field mapping */}
            {formsSeen.length > 0 && (
                <FormMappingSection formsSeen={formsSeen} fieldMaps={fieldMaps} onMap={openMappingDialog} />
            )}

            {/* Webhook setup */}
            <LeadCaptureSetup appUrl={appUrl} googleAccounts={googleAccounts} />

            {/* Field mapping dialog */}
            <FormDialog
                open={!!mappingForm}
                onOpenChange={(open) => { if (!open) setMappingForm(null); }}
                title={mappingForm ? `Map fields — form ${mappingForm.formId}` : 'Map fields'}
                description="Pick which form question feeds each CRM field. Leave a slot on Auto to keep the built-in detection."
                icon={MapPin}
                submitLabel="Save mapping"
                onSubmit={saveMapping}
            >
                {mappingForm && IDENTITY_SLOTS.map((slot) => (
                    <Field key={slot.key} label={slot.label}>
                        <Select
                            value={mappingDraft[slot.key] || ''}
                            onChange={(value) => setMappingDraft((previous) => ({ ...previous, [slot.key]: value === '__auto__' ? '' : value }))}
                            options={[
                                { value: '__auto__', label: 'Auto (built-in detection)' },
                                ...mappingForm.keys.map((key) => ({ value: key, label: key })),
                            ]}
                            placeholder="Auto (built-in detection)"
                        />
                    </Field>
                ))}
            </FormDialog>
        </div>
    );
}
