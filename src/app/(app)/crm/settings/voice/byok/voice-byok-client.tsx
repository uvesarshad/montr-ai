'use client';

import { useState } from 'react';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2 } from 'lucide-react';

interface ByokConfig {
  _id: string;
  providerId: 'twilio' | 'plivo' | 'telnyx' | 'in-house';
  displayName: string;
  enabled: boolean;
  pricePerMinuteUsd?: number;
  createdAt: string;
  updatedAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

export default function VoiceByokClient() {
  const { toast } = useToast();
  const { data, isLoading, mutate } = useSWR<{ data: ByokConfig[] }>(
    '/api/v2/voice/provider-configs',
    fetcher,
  );
  const [addOpen, setAddOpen] = useState(false);

  async function toggle(c: ByokConfig, enabled: boolean) {
    const res = await fetch(`/api/v2/voice/provider-configs/${c._id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast({ title: 'Failed to update', variant: 'destructive' });
      return;
    }
    mutate();
  }

  async function remove(c: ByokConfig) {
    if (!confirm(`Delete "${c.displayName}"? Calls in flight using this credential will continue.`)) {
      return;
    }
    const res = await fetch(`/api/v2/voice/provider-configs/${c._id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast({ title: 'Failed to delete', variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted' });
    mutate();
  }

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const configs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}>Add Credential</Button>
      </div>

      {configs.length === 0 ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground text-sm">
          No personal credentials yet. Adding one means you pay your provider
          directly; MontrAI just orchestrates the calls.
        </div>
      ) : (
        <ul className="divide-y border rounded-md">
          {configs.map((c) => (
            <li key={c._id} className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  {c.displayName}
                  <Badge variant="outline">{c.providerId}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Added {new Date(c.createdAt).toLocaleDateString()}
                  {typeof c.pricePerMinuteUsd === 'number'
                    ? ` · $${c.pricePerMinuteUsd}/min`
                    : ''}
                </div>
              </div>
              <Switch
                checked={c.enabled}
                onCheckedChange={(v) => toggle(c, v)}
                aria-label="Toggle enabled"
              />
              <Button variant="outline" size="sm" onClick={() => remove(c)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => { mutate(); setAddOpen(false); }} />
    </div>
  );
}

function AddDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [providerId, setProviderId] = useState<'twilio' | 'plivo' | 'telnyx' | 'in-house'>('twilio');
  const [displayName, setDisplayName] = useState('');
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/v2/voice/provider-configs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId,
          displayName: displayName || `My ${providerId}`,
          credential: { accountSid, authToken },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: 'Failed to save',
          description: body.error,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Credential saved' });
      setDisplayName('');
      setAccountSid('');
      setAuthToken('');
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Provider Credential</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Select
              value={providerId}
              onValueChange={(v) =>
                setProviderId(v as 'twilio' | 'plivo' | 'telnyx' | 'in-house')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="plivo" disabled>
                  Plivo (coming soon)
                </SelectItem>
                <SelectItem value="telnyx" disabled>
                  Telnyx (coming soon)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. My Twilio prod" />
          </div>
          <div>
            <Label>Account SID</Label>
            <Input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} />
          </div>
          <div>
            <Label>Auth token</Label>
            <Input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Stored encrypted at rest. Never shown back to you after saving.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !accountSid || !authToken}>
            {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
