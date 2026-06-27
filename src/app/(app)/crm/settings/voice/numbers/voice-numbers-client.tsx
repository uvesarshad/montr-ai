'use client';

import { useState } from 'react';
import useSWR from 'swr';

import { useCurrentBrand } from '@/hooks/use-current-brand';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Phone, Settings, Trash2 } from 'lucide-react';

interface NumberDoc {
  _id: string;
  providerId: 'twilio' | 'plivo' | 'telnyx' | 'in-house';
  phoneNumber: string;
  friendlyName?: string;
  countryCode?: string;
  status: 'active' | 'suspended' | 'released';
  inboundRouting: {
    type: 'workflow' | 'ai_bot' | 'human_queue' | 'forward' | 'voicemail' | 'disabled';
    targetId?: string;
    maxRingSeconds?: number;
  };
  pricePerMinuteUsd?: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

export default function VoiceNumbersClient() {
  const { toast } = useToast();
  const { currentBrandId } = useCurrentBrand();
  const numbersUrl = `/api/v2/voice/numbers${
    currentBrandId === null ? '' : `?brandId=${encodeURIComponent(currentBrandId)}`
  }`;
  const { data, isLoading, mutate } = useSWR<{ data: NumberDoc[] }>(numbersUrl, fetcher);

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [routingFor, setRoutingFor] = useState<NumberDoc | null>(null);

  async function release(n: NumberDoc) {
    if (!confirm(`Release ${n.phoneNumber}? This stops routing immediately.`)) return;
    const res = await fetch(`/api/v2/voice/numbers/${n._id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ title: 'Failed to release', variant: 'destructive' });
      return;
    }
    toast({ title: 'Number released' });
    mutate();
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const numbers = (data?.data ?? []).filter((n) => n.status !== 'released');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setProvisionOpen(true)}>
          <Phone className="size-4 mr-1" /> Provision Number
        </Button>
      </div>

      {numbers.length === 0 ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground text-sm">
          No phone numbers yet. Provision one from your connected provider.
        </div>
      ) : (
        <ul className="divide-y border rounded-md">
          {numbers.map((n) => (
            <li key={n._id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {n.phoneNumber}
                  {n.friendlyName && (
                    <span className="text-sm text-muted-foreground">
                      · {n.friendlyName}
                    </span>
                  )}
                  <Badge variant="outline">{n.providerId}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Routes to <strong>{n.inboundRouting.type}</strong>
                  {n.inboundRouting.targetId
                    ? ` · target ${n.inboundRouting.targetId}`
                    : ''}
                  {typeof n.pricePerMinuteUsd === 'number'
                    ? ` · $${n.pricePerMinuteUsd}/min`
                    : ''}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRoutingFor(n)}>
                <Settings className="size-4 mr-1" /> Routing
              </Button>
              <Button variant="outline" size="sm" onClick={() => release(n)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ProvisionDialog
        open={provisionOpen}
        onOpenChange={setProvisionOpen}
        defaultBrandId={currentBrandId}
        onCreated={() => {
          mutate();
          setProvisionOpen(false);
        }}
      />
      <RoutingDialog
        number={routingFor}
        onOpenChange={(open) => !open && setRoutingFor(null)}
        onSaved={() => {
          mutate();
          setRoutingFor(null);
        }}
      />
    </div>
  );
}

function ProvisionDialog({
  open,
  onOpenChange,
  onCreated,
  defaultBrandId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  defaultBrandId: string | null;
}) {
  const { toast } = useToast();
  const [providerId, setProviderId] = useState<'twilio' | 'plivo' | 'telnyx' | 'in-house'>('twilio');
  const [countryCode, setCountryCode] = useState('US');
  const [areaCode, setAreaCode] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/v2/voice/numbers/provision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId,
          countryCode,
          areaCode: areaCode || undefined,
          phoneNumber: phoneNumber || undefined,
          friendlyName: friendlyName || undefined,
          brandId: defaultBrandId ?? undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: 'Provisioning failed',
          description: body.message ?? body.error,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Number provisioned',
        description: body.voiceUrlWarning
          ? `Number purchased but inbound routing not configured: ${body.voiceUrlWarning}`
          : undefined,
      });
      setAreaCode('');
      setFriendlyName('');
      setPhoneNumber('');
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provision Phone Number</DialogTitle>
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
            <Label>Country code (ISO 2)</Label>
            <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label>Specific number (optional)</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+14155551234"
            />
          </div>
          <div>
            <Label>Area code (optional, used if no specific number)</Label>
            <Input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              placeholder="415"
            />
          </div>
          <div>
            <Label>Friendly name (optional)</Label>
            <Input value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
            Provision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoutingDialog({
  number,
  onOpenChange,
  onSaved,
}: {
  number: NumberDoc | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<NumberDoc['inboundRouting']['type']>(
    number?.inboundRouting.type ?? 'disabled',
  );
  const [targetId, setTargetId] = useState<string>(number?.inboundRouting.targetId ?? '');
  const [maxRingSeconds, setMaxRingSeconds] = useState<string>(
    String(number?.inboundRouting.maxRingSeconds ?? 30),
  );
  const [submitting, setSubmitting] = useState(false);

  // Re-sync when the dialog opens for a different number.
  if (number && number.inboundRouting.type !== type && targetId === '') {
    setType(number.inboundRouting.type);
    setTargetId(number.inboundRouting.targetId ?? '');
    setMaxRingSeconds(String(number.inboundRouting.maxRingSeconds ?? 30));
  }

  async function submit() {
    if (!number) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/voice/numbers/${number._id}/routing`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          targetId: targetId || undefined,
          maxRingSeconds: parseInt(maxRingSeconds, 10) || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: 'Save failed',
          description: body.error,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Routing saved' });
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  const targetLabel: Record<NumberDoc['inboundRouting']['type'], string> = {
    workflow: 'Workflow ID',
    ai_bot: 'AI Bot ID',
    human_queue: 'Queue ID',
    forward: 'Forward to (E.164)',
    voicemail: 'Voicemail box name (optional)',
    disabled: '(disabled — no target)',
  };

  return (
    <Dialog open={!!number} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inbound Routing — {number?.phoneNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Route to</Label>
            <Select value={type} onValueChange={(v) => setType(v as NumberDoc['inboundRouting']['type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workflow">Workflow</SelectItem>
                <SelectItem value="ai_bot">AI Bot</SelectItem>
                <SelectItem value="human_queue">Human Queue</SelectItem>
                <SelectItem value="forward">Forward to Number</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type !== 'disabled' && (
            <div>
              <Label>{targetLabel[type]}</Label>
              <Input
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={
                  type === 'forward'
                    ? '+14155551234'
                    : type === 'voicemail'
                    ? 'sales-vm'
                    : '<mongo id>'
                }
              />
            </div>
          )}
          <div>
            <Label>Max ring seconds</Label>
            <Input
              type="number"
              value={maxRingSeconds}
              onChange={(e) => setMaxRingSeconds(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
