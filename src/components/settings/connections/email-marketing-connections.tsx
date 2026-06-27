'use client';

import { useQuery } from '@tanstack/react-query';
import {
    Plus,
    Power,
    Mail,
    Globe,
    Shield,
} from 'lucide-react';
import {
    Button,
    Card,
    Chip,
    Spinner,
    FormDialog,
    Field,
    Input,
    Select,
} from '@/components/ui-kit';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";

interface Brand {
    _id: string;
    name: string;
    handle: string;
}

interface EmailMarketingConnectionsProps {
    viewMode?: 'grid' | 'list';
    searchQuery?: string;
    hideTitle?: boolean;
    selectedBrandId?: string;
    brands?: Brand[];
}

interface EmailProvider {
    _id: string;
    name: string;
    type: string;
    fromEmail: string;
    fromName?: string;
    replyToEmail?: string;
    isDefault?: boolean;
    isVerified?: boolean;
    lastTestedAt?: string | Date;
    [key: string]: unknown;
}

interface ProviderCardProps {
    provider: EmailProvider;
    viewMode: 'grid' | 'list';
    onVerify: (id: string) => void;
}

function ProviderCard({ provider, viewMode, onVerify }: ProviderCardProps) {
    return viewMode === 'list' ? (
        <Card
            className={cn(provider.isVerified && "border-brand/40 bg-brand-muted/30")}
            bodyClassName="flex items-center justify-between p-4"
        >
            <div className="flex items-center gap-4">
                <span className={cn(
                    "grid size-9 place-items-center rounded-lg",
                    provider.isVerified ? "border border-border bg-card shadow-sm" : "bg-muted"
                )}>
                    <Mail className={cn("size-5", provider.isVerified ? "text-info" : "text-muted-foreground")} />
                </span>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{provider.name}</span>
                        <Chip tone="gray" className="uppercase">{provider.type}</Chip>
                        {provider.isDefault && <Chip tone="brand">Default</Chip>}
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{provider.fromEmail}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Chip tone={provider.isVerified ? "ok" : "danger"} dot>
                    {provider.isVerified ? "Verified" : "Unverified"}
                </Chip>
                <Button variant="ghost" size="sm" icon={Power} onClick={() => onVerify(provider._id)}>
                    Verify
                </Button>
            </div>
        </Card>
    ) : (
        <Card
            lift
            className={cn("h-full", provider.isVerified && "border-brand/40 bg-brand-muted/30")}
            bodyClassName="flex flex-col p-4"
        >
            <div className="flex items-start justify-between">
                <span className={cn(
                    "grid size-10 place-items-center rounded-full",
                    provider.isVerified ? "border border-border bg-card" : "bg-muted"
                )}>
                    <Mail className={cn("size-6", provider.isVerified ? "text-info" : "text-muted-foreground")} />
                </span>
                <div className="flex gap-2">
                    <Chip tone="gray" className="uppercase">{provider.type}</Chip>
                    <Chip tone={provider.isVerified ? "ok" : "danger"}>
                        {provider.isVerified ? "Verified" : "Unverified"}
                    </Chip>
                </div>
            </div>
            <div className="mt-4 flex-1">
                <h4 className="mb-1 truncate text-base font-semibold" title={provider.name}>{provider.name}</h4>
                <p className="mb-4 text-[13px] text-muted-foreground">
                    {provider.fromEmail}
                    {provider.isDefault && (
                        <span className="ml-2 inline-flex items-center text-xs font-medium text-brand-strong">
                            (Default)
                        </span>
                    )}
                </p>

                <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
                        <span className="flex items-center text-muted-foreground"><Shield className="mr-1.5 size-3" /> Security</span>
                        <span className="font-medium">{provider.isVerified ? "Verified" : "Not Verified"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
                        <span className="flex items-center text-muted-foreground"><Globe className="mr-1.5 size-3" /> Last Tested</span>
                        <span className="font-medium">{provider.lastTestedAt ? new Date(provider.lastTestedAt).toLocaleDateString() : 'Never'}</span>
                    </div>
                </div>
            </div>
            <Button
                variant={provider.isVerified ? "outline" : "brand"}
                className="mt-4 w-full"
                icon={Power}
                onClick={() => onVerify(provider._id)}
            >
                {provider.isVerified ? "Re-verify Connection" : "Verify Connection"}
            </Button>
        </Card>
    );
}

export function EmailMarketingConnections({
    viewMode = 'grid',
    searchQuery = '',
    hideTitle = false,
    selectedBrandId: _selectedBrandId = '',
    brands: _brands = []
}: EmailMarketingConnectionsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Basic form state management
    const [formData, setFormData] = useState({
        name: '',
        type: 'smtp',
        fromName: '',
        fromEmail: '',
        replyToEmail: '',
        apiKey: '', // Brevo
        region: '', // SES
        accessKeyId: '', // SES
        secretAccessKey: '', // SES
        host: '', // SMTP
        port: 587, // SMTP
        user: '', // SMTP
        pass: '', // SMTP
        secure: false, // SMTP
        isDefault: false
    });

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['marketing-providers'],
        queryFn: async () => {
            const res = await fetch('/api/v2/marketing-email/providers');
            if (!res.ok) throw new Error('Failed to fetch providers');
            return res.json();
        },
    });

    const filteredProviders = useMemo(() => {
        const providers: EmailProvider[] = data?.data || [];
        if (!searchQuery) return providers;
        const q = searchQuery.toLowerCase();
        return providers.filter((p: EmailProvider) =>
            p.name.toLowerCase().includes(q) ||
            p.type.toLowerCase().includes(q) ||
            p.fromEmail.toLowerCase().includes(q)
        );
    }, [data?.data, searchQuery]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                name: formData.name,
                type: formData.type,
                fromName: formData.fromName,
                fromEmail: formData.fromEmail,
                replyToEmail: formData.replyToEmail,
                isDefault: formData.isDefault
            };

            if (formData.type === 'brevo') {
                payload.apiKey = formData.apiKey;
            } else if (formData.type === 'ses') {
                payload.region = formData.region;
                payload.accessKeyId = formData.accessKeyId;
                payload.secretAccessKey = formData.secretAccessKey;
            } else {
                payload.host = formData.host;
                payload.port = parseInt(String(formData.port));
                payload.user = formData.user;
                payload.pass = formData.pass;
                payload.secure = formData.secure;
            }

            const res = await fetch('/api/v2/marketing-email/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error?.message || 'Failed to create provider');
            }

            toast.success('Provider created successfully');
            setIsOpen(false);
            refetch();
            setFormData({ ...formData, name: '' });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Operation failed');
            throw error;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerify = async (id: string) => {
        const toastId = toast.loading('Verifying connection...');
        try {
            const res = await fetch(`/api/v2/marketing-email/providers/${id}/verify`, { method: 'POST' });
            const result = await res.json();

            if (!res.ok || !result.success) {
                throw new Error(result.message || 'Verification failed');
            }

            toast.success('Connection verified!', { id: toastId });
            refetch();
        } catch (error) {
            toast.error(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
        }
    };

    if (filteredProviders.length === 0 && searchQuery && !("email marketing smtp brevo ses".includes(searchQuery.toLowerCase()))) {
        return null;
    }

    const handleOpenProviderDialog = (type: string = 'smtp') => {
        setFormData({ ...formData, type, name: '', fromEmail: '', fromName: '', replyToEmail: '', apiKey: '', region: '', accessKeyId: '', secretAccessKey: '', host: '', port: 587, user: '', pass: '', secure: false, isDefault: false });
        setIsOpen(true);
    };

    return (
        <div className="contents">
            {!hideTitle && (
                <div className="col-span-full mb-6 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-medium">Email Providers</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure your email marketing service providers.
                        </p>
                    </div>
                </div>
            )}

            <FormDialog
                open={isOpen}
                onOpenChange={setIsOpen}
                title="Add Email Provider"
                description="Configure a new email provider for sending marketing campaigns."
                icon={Mail}
                size="lg"
                submitLabel={isSubmitting ? 'Saving...' : 'Save Provider'}
                submitting={isSubmitting}
                onSubmit={handleSubmit}
            >
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Provider Type">
                        <Select
                            value={formData.type}
                            onChange={(val) => setFormData({ ...formData, type: val })}
                            options={[
                                { value: 'smtp', label: 'SMTP (Generic)' },
                                { value: 'brevo', label: 'Brevo (API)' },
                                { value: 'ses', label: 'AWS SES (API)' },
                            ]}
                        />
                    </Field>
                    <Field label="Internal Name">
                        <Input
                            placeholder="My Provider"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="From Name">
                        <Input
                            placeholder="Company Name"
                            value={formData.fromName}
                            onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                        />
                    </Field>
                    <Field label="From Email">
                        <Input
                            placeholder="marketing@company.com"
                            value={formData.fromEmail}
                            onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                        />
                    </Field>
                </div>

                {formData.type === 'brevo' && (
                    <Field label="API Key">
                        <Input
                            type="password"
                            value={formData.apiKey}
                            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                        />
                    </Field>
                )}

                {formData.type === 'ses' && (
                    <>
                        <Field label="Region">
                            <Input
                                placeholder="us-east-1"
                                value={formData.region}
                                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                            />
                        </Field>
                        <Field label="Access Key ID">
                            <Input
                                value={formData.accessKeyId}
                                onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                            />
                        </Field>
                        <Field label="Secret Access Key">
                            <Input
                                type="password"
                                value={formData.secretAccessKey}
                                onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                            />
                        </Field>
                    </>
                )}

                {formData.type === 'smtp' && (
                    <>
                        <div className="grid grid-cols-3 gap-4">
                            <Field label="Host" className="col-span-2">
                                <Input
                                    placeholder="smtp.example.com"
                                    value={formData.host}
                                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                />
                            </Field>
                            <Field label="Port">
                                <Input
                                    type="number"
                                    value={formData.port}
                                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                                />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="User">
                                <Input
                                    value={formData.user}
                                    onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                                />
                            </Field>
                            <Field label="Password">
                                <Input
                                    type="password"
                                    value={formData.pass}
                                    onChange={(e) => setFormData({ ...formData, pass: e.target.value })}
                                />
                            </Field>
                        </div>
                    </>
                )}
            </FormDialog>

            {isLoading ? (
                <div className="col-span-full flex items-center justify-center py-12">
                    <Spinner size={28} />
                </div>
            ) : (
                <>
                    {/* Connect New Provider Card */}
                    {viewMode === 'list' ? (
                        <Card
                            lift
                            className="cursor-pointer border-dashed"
                            bodyClassName="flex items-center justify-between p-4"
                        >
                            <button type="button" className="flex flex-1 items-center gap-4 text-left" onClick={() => handleOpenProviderDialog()}>
                                <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                                    <Plus className="size-5" />
                                </span>
                                <div>
                                    <span className="block text-sm font-semibold">Connect New Provider</span>
                                    <p className="text-xs text-muted-foreground">Add SMTP, Brevo, or AWS SES</p>
                                </div>
                            </button>
                            <Button size="sm" variant="ghost" onClick={() => handleOpenProviderDialog()}>Connect</Button>
                        </Card>
                    ) : (
                        <Card
                            lift
                            className="h-full cursor-pointer border-dashed"
                            bodyClassName="flex flex-col p-4"
                        >
                            <div
                                className="flex flex-1 cursor-pointer flex-col"
                                role="button"
                                tabIndex={0}
                                onClick={() => handleOpenProviderDialog()}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleOpenProviderDialog(); }}
                            >
                            <div className="flex items-start justify-between">
                                <span className="grid size-10 place-items-center rounded-full bg-muted">
                                    <Mail className="size-6 text-foreground" />
                                </span>
                                <Chip tone="gray">Not Connected</Chip>
                            </div>
                            <div className="mt-4 flex-1">
                                <h4 className="mb-1 text-base font-semibold">Connect New Provider</h4>
                                <p className="text-[13px] text-muted-foreground">
                                    Send marketing emails via SMTP, Brevo, or AWS SES
                                </p>
                            </div>
                            </div>
                            <Button variant="brand" className="mt-4 w-full" icon={Mail} onClick={() => handleOpenProviderDialog()}>
                                Connect
                            </Button>
                        </Card>
                    )}

                    {filteredProviders.map((provider: EmailProvider) => (
                        <ProviderCard
                            key={provider._id}
                            provider={provider}
                            viewMode={viewMode}
                            onVerify={handleVerify}
                        />
                    ))}
                </>
            )}
        </div>
    );
}
