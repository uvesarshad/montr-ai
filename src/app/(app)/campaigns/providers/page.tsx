'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, CheckCircle2, XCircle, Power, Settings, Info } from 'lucide-react';

import {
  Button,
  Card,
  Chip,
  Input,
  Banner,
  DataTable,
  FormDialog,
  Field,
  Select,
  type DataTableColumn,
} from '@/components/ui-kit';
import { ModuleShell } from '@/components/shell/module-shell';

interface EmailProvider {
  _id: string;
  name: string;
  type: string;
  fromEmail?: string;
  isDefault?: boolean;
  isVerified?: boolean;
  lastTestedAt?: string;
}

const PROVIDER_TYPES = [
  { value: 'smtp', label: 'SMTP (Generic)' },
  { value: 'brevo', label: 'Brevo (API)' },
  { value: 'ses', label: 'AWS SES (API)' },
];

interface ProviderFormData {
  name: string;
  type: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  apiKey: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  isDefault: boolean;
}

function ProviderFormFields({
  formData,
  setFormData,
}: {
  formData: ProviderFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProviderFormData>>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Provider type">
          <Select
            value={formData.type}
            onChange={(val) => setFormData({ ...formData, type: val })}
            options={PROVIDER_TYPES}
            triggerClassName="w-full"
          />
        </Field>
        <Field label="Internal name">
          <Input
            placeholder="My Provider"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Field label="From name">
          <Input
            placeholder="Company Name"
            value={formData.fromName}
            onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
          />
        </Field>
        <Field label="From email">
          <Input
            placeholder="marketing@company.com"
            value={formData.fromEmail}
            onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
          />
        </Field>
      </div>

      {formData.type === 'brevo' ? (
        <Field label="API key">
          <Input
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
          />
        </Field>
      ) : null}

      {formData.type === 'ses' ? (
        <>
          <Field label="Region">
            <Input
              placeholder="us-east-1"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            />
          </Field>
          <Field label="Access key ID">
            <Input
              value={formData.accessKeyId}
              onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
            />
          </Field>
          <Field label="Secret access key">
            <Input
              type="password"
              value={formData.secretAccessKey}
              onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
            />
          </Field>
        </>
      ) : null}

      {formData.type === 'smtp' ? (
        <>
          <div className="grid grid-cols-3 gap-3.5">
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
          <div className="grid grid-cols-2 gap-3.5">
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
      ) : null}
    </>
  );
}

export default function ProvidersPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Basic form state management (since schema is complex conditional)
  const [formData, setFormData] = useState<ProviderFormData>({
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
    isDefault: false,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['marketing-providers'],
    queryFn: async () => {
      const res = await fetch('/api/v2/marketing-email/providers');
      if (!res.ok) throw new Error('Failed to fetch providers');
      return res.json();
    },
  });

  const providers: EmailProvider[] = useMemo(() => data?.data || [], [data]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Construct payload based on type
      const payload: Record<string, string | number | boolean | undefined> = {
        name: formData.name,
        type: formData.type,
        fromName: formData.fromName,
        fromEmail: formData.fromEmail,
        replyToEmail: formData.replyToEmail,
        isDefault: formData.isDefault,
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
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create provider');
      }

      toast.success('Provider created successfully');
      refetch();

      // Reset form (simplified)
      setFormData({ ...formData, name: '' });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unknown error');
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
    } catch (error: unknown) {
      toast.error(`Verification failed: ${error instanceof Error ? error.message : String(error)}`, { id: toastId });
    }
  };

  const columns = useMemo<DataTableColumn<EmailProvider>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13.5px]">{row.original.name}</span>
            {row.original.isDefault ? <Chip tone="brand">Default</Chip> : null}
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => <span className="uppercase text-muted-foreground">{row.original.type}</span>,
      },
      {
        accessorKey: 'fromEmail',
        header: 'From',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.fromEmail}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isVerified ? (
            <Chip tone="ok" icon={CheckCircle2}>
              Verified
            </Chip>
          ) : (
            <Chip tone="danger" icon={XCircle}>
              Unverified
            </Chip>
          ),
      },
      {
        accessorKey: 'lastTestedAt',
        header: 'Last tested',
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {row.original.lastTestedAt ? new Date(row.original.lastTestedAt).toLocaleString() : 'Never'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="outline" size="sm" icon={Power} onClick={() => handleVerify(row.original._id)}>
            Verify
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ModuleShell
      title="Providers"
      icon={Settings}
      meta="Email sending providers"
      primaryAction={
        <Button variant="brand" icon={Plus} onClick={() => setIsOpen(true)}>
          Add provider
        </Button>
      }
      isLoading={isLoading}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {!isLoading && providers.length === 0 ? (
        <Banner
          tone="info"
          icon={Info}
          title="No providers connected"
          action={
            <Button variant="brand" size="sm" icon={Plus} onClick={() => setIsOpen(true)}>
              Add provider
            </Button>
          }
        >
          Connect an SMTP, Brevo, or AWS SES provider to start sending marketing campaigns.
        </Banner>
      ) : null}

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          data={providers}
          getRowId={(row) => row._id}
          enableSorting={false}
          emptyTitle="No providers configured"
          emptyNote="Add an email provider to start sending marketing campaigns."
        />
      </Card>

      <FormDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Add email provider"
        icon={Settings}
        description="Configure a new email provider for sending marketing campaigns."
        size="lg"
        submitLabel="Save provider"
        submitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <ProviderFormFields formData={formData} setFormData={setFormData} />
      </FormDialog>
    </ModuleShell>
  );
}
