'use client';

import { useReducer, useState } from 'react';
import useSWR from 'swr';

import {
  Button,
  Input,
  EmptyState,
  Chip,
  Spinner,
  Field,
  Select,
  FormDialog,
  ConfirmDialog,
} from '@/components/ui-kit';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Phone, Trash2 } from 'lucide-react';

interface ProviderConfig {
  _id: string;
  scope: 'system' | 'org' | 'brand' | 'user';
  providerId: 'twilio' | 'plivo' | 'telnyx' | 'in-house';
  brandId?: string | null;
  userId?: string | null;
  displayName: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  pricePerMinuteUsd?: number;
  createdAt: string;
  updatedAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

export default function VoiceProvidersClient() {
  const { toast } = useToast();
  const { data, isLoading, mutate } = useSWR<{ data: ProviderConfig[] }>(
    '/api/v2/admin/voice/provider-configs?scope=system',
    fetcher,
  );

  const [addOpen, setAddOpen] = useState(false);
  const [testOpen, setTestOpen] = useState<ProviderConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderConfig | null>(null);

  async function toggleEnabled(config: ProviderConfig, next: boolean) {
    const res = await fetch(`/api/v2/admin/voice/provider-configs/${config._id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) {
      toast({ title: 'Failed to update', variant: 'destructive' });
      return;
    }
    mutate();
  }

  async function remove(config: ProviderConfig) {
    const res = await fetch(`/api/v2/admin/voice/provider-configs/${config._id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast({ title: 'Failed to delete', variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted' });
    setDeleteTarget(null);
    mutate();
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size={14} />
        Loading provider configs…
      </div>
    );
  }

  const configs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={Phone} onClick={() => setAddOpen(true)}>Add Provider</Button>
      </div>

      {configs.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="No voice providers configured"
          note="Add Twilio (or another provider) to enable voice features for your tenants."
        />
      ) : (
        <ul className="divide-y border border-border rounded-xl overflow-hidden bg-card">
          {configs.map((c) => (
            <li key={c._id} className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2 text-sm">
                  {c.displayName}
                  <Chip tone="info">{c.providerId}</Chip>
                  <Chip tone="gray">{c.scope}</Chip>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Updated {new Date(c.updatedAt).toLocaleString()}
                  {typeof c.pricePerMinuteUsd === 'number'
                    ? ` · $${c.pricePerMinuteUsd}/min`
                    : ''}
                </div>
              </div>
              <Switch
                checked={c.enabled}
                onCheckedChange={(v) => toggleEnabled(c, v)}
                aria-label="Toggle enabled"
              />
              <Button variant="outline" size="sm" icon={Phone} onClick={() => setTestOpen(c)}>
                Test
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setDeleteTarget(c)}
                aria-label="Delete provider"
              />
            </li>
          ))}
        </ul>
      )}

      <AddProviderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          mutate();
          setAddOpen(false);
        }}
      />
      <TestCallDialog
        config={testOpen}
        onOpenChange={(open) => !open && setTestOpen(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete provider config?"
        description={deleteTarget ? `This will permanently delete "${deleteTarget.displayName}". This action cannot be undone.` : undefined}
        onConfirm={async () => { if (deleteTarget) await remove(deleteTarget); }}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

type ProviderId = 'twilio' | 'plivo' | 'telnyx' | 'in-house';

interface AddProviderFormState {
  providerId: ProviderId;
  displayName: string;
  accountSid: string;
  authToken: string;
  pricePerMinuteUsd: string;
}

const initialAddProviderForm: AddProviderFormState = {
  providerId: 'twilio',
  displayName: '',
  accountSid: '',
  authToken: '',
  pricePerMinuteUsd: '0.013',
};

type AddProviderFormAction =
  | { type: 'setProviderId'; value: ProviderId }
  | { type: 'setField'; field: 'displayName' | 'accountSid' | 'authToken' | 'pricePerMinuteUsd'; value: string }
  | { type: 'resetAfterCreate' };

function addProviderFormReducer(state: AddProviderFormState, action: AddProviderFormAction): AddProviderFormState {
  switch (action.type) {
    case 'setProviderId':
      return { ...state, providerId: action.value };
    case 'setField':
      return { ...state, [action.field]: action.value };
    case 'resetAfterCreate':
      return { ...state, displayName: '', accountSid: '', authToken: '' };
    default:
      return state;
  }
}

function AddProviderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, dispatchForm] = useReducer(addProviderFormReducer, initialAddProviderForm);
  const { providerId, displayName, accountSid, authToken, pricePerMinuteUsd } = form;
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/v2/admin/voice/provider-configs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: 'system',
          providerId,
          displayName: displayName || `${providerId} system default`,
          credential: { accountSid, authToken },
          pricePerMinuteUsd: parseFloat(pricePerMinuteUsd) || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: 'Failed to create',
          description: body.error ?? 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Provider added' });
      dispatchForm({ type: 'resetAfterCreate' });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Voice Provider"
      icon={Phone}
      size="md"
      submitLabel="Save"
      submitting={submitting}
      onSubmit={submit}
    >
      <div className="space-y-4">
        <Field label="Provider">
          <Select
            value={providerId}
            onChange={(v) => dispatchForm({ type: 'setProviderId', value: v as ProviderId })}
            options={[
              { value: 'twilio', label: 'Twilio' },
              { value: 'plivo', label: 'Plivo (coming soon)' },
              { value: 'telnyx', label: 'Telnyx (coming soon)' },
              { value: 'in-house', label: 'In-house IVR (future)' },
            ]}
          />
        </Field>

        <Field label="Display name">
          <Input
            value={displayName}
            onChange={(e) => dispatchForm({ type: 'setField', field: 'displayName', value: e.target.value })}
            placeholder="e.g. Twilio production"
          />
        </Field>

        <Field label="Account SID" required>
          <Input value={accountSid} onChange={(e) => dispatchForm({ type: 'setField', field: 'accountSid', value: e.target.value })} />
        </Field>

        <Field label="Auth token" required>
          <Input
            type="password"
            value={authToken}
            onChange={(e) => dispatchForm({ type: 'setField', field: 'authToken', value: e.target.value })}
          />
        </Field>

        <Field label="Price per minute (USD)">
          <Input
            type="number"
            step="0.001"
            value={pricePerMinuteUsd}
            onChange={(e) => dispatchForm({ type: 'setField', field: 'pricePerMinuteUsd', value: e.target.value })}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

function TestCallDialog({
  config,
  onOpenChange,
}: {
  config: ProviderConfig | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!config) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v2/admin/voice/test-call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerConfigId: config._id, from, to }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: 'Test call failed',
          description: body.message ?? body.error,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Test call placed',
        description: `Status: ${body.status} · Call SID: ${body.providerCallId}`,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={!!config}
      onOpenChange={onOpenChange}
      title={`Test Call — ${config?.displayName ?? ''}`}
      icon={Phone}
      size="sm"
      submitLabel="Place call"
      submitting={submitting}
      onSubmit={submit}
    >
      <div className="space-y-4">
        <Field label="From (E.164)" required>
          <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="+14155551234" />
        </Field>
        <Field label="To (E.164)" required>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+14155557777" />
        </Field>
      </div>
    </FormDialog>
  );
}
