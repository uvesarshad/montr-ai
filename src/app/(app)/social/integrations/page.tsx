'use client';

/**
 * Social · Integrations (Epic 6).
 *
 * Manage public API keys (create → copy-once → revoke) and outbound webhook
 * subscriptions (URL + events + active). Composes from the ui-kit only.
 */

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plug, Plus, Trash2, Webhook } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import {
  Banner,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  CopyField,
  Field,
  FormDialog,
  Input,
  Select,
  Skeleton,
  Switch,
  Table,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

interface ApiKey {
  id: string;
  name: string;
  maskedKey: string;
  scopes: string[];
  lastUsedAt: string | null;
  revoked: boolean;
  expiresAt: string | null;
  createdAt: string;
}

interface WebhookSub {
  id: string;
  name: string;
  url: string;
  events: string[];
  brandId: string | null;
  active: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: number | null;
  failureCount: number;
  createdAt: string;
}

const WEBHOOK_EVENTS = [
  { value: 'post.published', label: 'Post published' },
  { value: 'post.failed', label: 'Post failed' },
  { value: 'post.approved', label: 'Post approved' },
  { value: 'post.scheduled', label: 'Post scheduled' },
];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong';
}

export default function SocialIntegrationsPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [subs, setSubs] = useState<WebhookSub[]>([]);

  // Create-key dialog
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Revoke confirm
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null);

  // Create-webhook dialog
  const [hookDialogOpen, setHookDialogOpen] = useState(false);
  const [hookName, setHookName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvent, setHookEvent] = useState('post.published');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // Delete-webhook confirm
  const [deleteHook, setDeleteHook] = useState<WebhookSub | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kRes, wRes] = await Promise.all([
        fetch('/api/social/api-keys'),
        fetch('/api/social/webhook-subscriptions'),
      ]);
      if (kRes.ok) {
        const data = await kRes.json();
        setKeys(data.keys ?? []);
      }
      if (wRes.ok) {
        const data = await wRes.json();
        setSubs(data.subscriptions ?? []);
      }
    } catch (e) {
      toast({ title: 'Failed to load integrations', description: errMsg(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- API keys ----------------------------------------------------------
  const createKey = async () => {
    const res = await fetch('/api/social/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create API key');
    }
    const data = await res.json();
    setCreatedKey(data.key);
    setNewKeyName('');
    await load();
  };

  const doRevoke = async (id: string) => {
    const res = await fetch(`/api/social/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to revoke key');
    }
    toast({ title: 'API key revoked' });
    await load();
  };

  // ---- Webhooks ----------------------------------------------------------
  const createHook = async () => {
    const res = await fetch('/api/social/webhook-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: hookName.trim(), url: hookUrl.trim(), events: [hookEvent] }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create webhook');
    }
    const data = await res.json();
    setCreatedSecret(data.secret ?? null);
    setHookName('');
    setHookUrl('');
    await load();
  };

  const toggleHook = async (sub: WebhookSub, active: boolean) => {
    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, active } : s)));
    const res = await fetch('/api/social/webhook-subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sub.id, active }),
    });
    if (!res.ok) {
      toast({ title: 'Failed to update webhook', variant: 'destructive' });
      await load();
    }
  };

  const doDeleteHook = async (id: string) => {
    const res = await fetch(`/api/social/webhook-subscriptions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete webhook');
    }
    toast({ title: 'Webhook deleted' });
    await load();
  };

  return (
    <ModuleShell
      title="Integrations"
      icon={Plug}
      contentClassName="flex flex-col gap-4 pb-8"
    >
      {/* API keys */}
      <Card
        icon={KeyRound}
        title="API keys"
        action={
          <Button size="sm" variant="brand" icon={Plus} onClick={() => { setCreatedKey(null); setKeyDialogOpen(true); }}>
            New key
          </Button>
        }
      >
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : keys.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            No API keys yet. Create one to use the public API.
          </p>
        ) : (
          <Table
            rowKey="id"
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'maskedKey', label: 'Key' },
              { key: 'scopes', label: 'Scopes' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: '', align: 'right' },
            ]}
            rows={keys.map((k) => ({
              id: k.id,
              name: k.name as React.ReactNode,
              maskedKey: <span className="font-mono text-[12px]">{k.maskedKey}</span>,
              scopes: (
                <div className="flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </div>
              ),
              status: k.revoked ? <Chip tone="danger">Revoked</Chip> : <Chip tone="ok">Active</Chip>,
              actions: k.revoked ? null : (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRevokeKey(k)}>
                  Revoke
                </Button>
              ),
            }))}
          />
        )}
      </Card>

      {/* Webhooks */}
      <Card
        icon={Webhook}
        title="Webhook subscriptions"
        action={
          <Button size="sm" variant="brand" icon={Plus} onClick={() => { setCreatedSecret(null); setHookDialogOpen(true); }}>
            New webhook
          </Button>
        }
      >
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : subs.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            No webhooks yet. Subscribe to post events to get notified at your URL.
          </p>
        ) : (
          <Table
            rowKey="id"
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'url', label: 'URL' },
              { key: 'events', label: 'Events' },
              { key: 'active', label: 'Active' },
              { key: 'actions', label: '', align: 'right' },
            ]}
            rows={subs.map((s) => ({
              id: s.id,
              name: s.name as React.ReactNode,
              url: <span className="font-mono text-[12px] text-muted-foreground">{s.url}</span>,
              events: (
                <div className="flex flex-wrap gap-1">
                  {s.events.map((e) => (
                    <Chip key={e}>{e}</Chip>
                  ))}
                </div>
              ),
              active: <Switch checked={s.active} onCheckedChange={(v) => toggleHook(s, v)} />,
              actions: (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteHook(s)}>
                  Delete
                </Button>
              ),
            }))}
          />
        )}
      </Card>

      {/* Create-key dialog */}
      <FormDialog
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
        title="Create API key"
        icon={KeyRound}
        submitLabel={createdKey ? 'Done' : 'Create key'}
        submitDisabled={!createdKey && !newKeyName.trim()}
        closeOnSuccess={Boolean(createdKey)}
        onSubmit={createdKey ? () => setKeyDialogOpen(false) : createKey}
      >
        {createdKey ? (
          <div className="flex flex-col gap-3">
            <Banner tone="warn">
              Copy this key now — it will not be shown again.
            </Banner>
            <CopyField value={createdKey} />
          </div>
        ) : (
          <Field label="Name" required>
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Zapier integration"
            />
          </Field>
        )}
      </FormDialog>

      {/* Revoke-key confirm */}
      <ConfirmDialog
        open={Boolean(revokeKey)}
        onOpenChange={(o) => { if (!o) setRevokeKey(null); }}
        title="Revoke API key?"
        description={`"${revokeKey?.name}" will stop working immediately. This cannot be undone.`}
        confirmLabel="Revoke"
        onConfirm={async () => { if (revokeKey) await doRevoke(revokeKey.id); setRevokeKey(null); }}
      />

      {/* Create-webhook dialog */}
      <FormDialog
        open={hookDialogOpen}
        onOpenChange={setHookDialogOpen}
        title="Create webhook"
        icon={Webhook}
        submitLabel={createdSecret ? 'Done' : 'Create webhook'}
        submitDisabled={!createdSecret && (!hookName.trim() || !hookUrl.trim())}
        closeOnSuccess={Boolean(createdSecret)}
        onSubmit={createdSecret ? () => setHookDialogOpen(false) : createHook}
      >
        {createdSecret ? (
          <div className="flex flex-col gap-3">
            <Banner tone="warn">
              Copy this signing secret now — it will not be shown again. Use it to verify the
              {' '}<code className="font-mono text-[11px]">X-Montrai-Signature</code> header.
            </Banner>
            <CopyField value={createdSecret} secret />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Name" required>
              <Input value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder="e.g. Slack notifier" />
            </Field>
            <Field label="Delivery URL" required hint="Must be a public https endpoint.">
              <Input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/webhooks/montrai" />
            </Field>
            <Field label="Event" required>
              <Select options={WEBHOOK_EVENTS} value={hookEvent} onChange={setHookEvent} />
            </Field>
          </div>
        )}
      </FormDialog>

      {/* Delete-webhook confirm */}
      <ConfirmDialog
        open={Boolean(deleteHook)}
        onOpenChange={(o) => { if (!o) setDeleteHook(null); }}
        title="Delete webhook?"
        description={`"${deleteHook?.name}" will stop receiving events. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => { if (deleteHook) await doDeleteHook(deleteHook.id); setDeleteHook(null); }}
      />
    </ModuleShell>
  );
}
