'use client';

import { useReducer, useState } from 'react';
import useSWR from 'swr';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface OwnedNumber {
  _id: string;
  phoneNumber: string;
  friendlyName?: string;
}

interface ContactRow {
  _id: string;
  firstName: string;
  lastName?: string;
  phone?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

interface BatchFormState {
  name: string;
  fromNumber: string;
  script: string;
  recordCall: boolean;
  callsPerMinute: string;
  selectedIds: Set<string>;
  csvInput: string;
}

type BatchFormAction =
  | { type: 'set'; field: 'name' | 'fromNumber' | 'script' | 'callsPerMinute' | 'csvInput'; value: string }
  | { type: 'setRecordCall'; value: boolean }
  | { type: 'toggleContact'; id: string }
  | { type: 'reset' };

const initialFormState: BatchFormState = {
  name: '',
  fromNumber: '',
  script: '',
  recordCall: false,
  callsPerMinute: '10',
  selectedIds: new Set(),
  csvInput: '',
};

function formReducer(state: BatchFormState, action: BatchFormAction): BatchFormState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'setRecordCall':
      return { ...state, recordCall: action.value };
    case 'toggleContact': {
      const next = new Set(state.selectedIds);
      if (next.has(action.id)) next.delete(action.id); else next.add(action.id);
      return { ...state, selectedIds: next };
    }
    case 'reset':
      return { ...initialFormState, selectedIds: new Set() };
    default:
      return state;
  }
}

export function BulkBatchCreateDialog({
  open,
  onOpenChange,
  onCreated,
  defaultBrandId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  defaultBrandId?: string | null;
}) {
  const { toast } = useToast();
  const brandFilter = defaultBrandId
    ? `&brandId=${encodeURIComponent(defaultBrandId)}`
    : '';
  const { data: numbersData } = useSWR<{ data: OwnedNumber[] }>(
    open ? `/api/v2/voice/numbers?status=active${brandFilter}` : null,
    fetcher,
  );
  const [search, setSearch] = useState('');
  const { data: contactsData } = useSWR<{ data: ContactRow[] }>(
    open ? `/api/v2/crm/contacts?limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}` : null,
    fetcher,
  );

  const [form, dispatch] = useReducer(formReducer, initialFormState);
  const { name, fromNumber, script, recordCall, callsPerMinute, selectedIds, csvInput } = form;
  const [submitting, setSubmitting] = useState(false);

  const numbers = numbersData?.data ?? [];
  const contacts = contactsData?.data ?? [];

  function toggle(id: string) {
    dispatch({ type: 'toggleContact', id });
  }

  async function submit() {
    setSubmitting(true);
    try {
      // Parse CSV input: one phone per line, optional ",FirstName".
      const csvEntries = csvInput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [phoneNumber, ...rest] = line.split(',').map((s) => s.trim());
          return { phoneNumber, variables: rest.length ? { firstName: rest[0] } : undefined };
        })
        .filter((e) => /^\+?[1-9]\d{6,14}$/.test(e.phoneNumber));

      const res = await fetch('/api/v2/voice/bulk-calls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name || `Batch ${new Date().toLocaleString()}`,
          fromNumber,
          script: script || undefined,
          recordCall,
          callsPerMinute: parseInt(callsPerMinute, 10) || 10,
          contactIds: Array.from(selectedIds),
          entries: csvEntries.length > 0 ? csvEntries : undefined,
          brandId: defaultBrandId ?? undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: 'Failed to create batch',
          description: body.error ?? body.message,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Batch started', description: `${body.data?.totals?.total ?? 0} entries queued.` });
      dispatch({ type: 'reset' });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Bulk Dialer Batch</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Batch name</Label>
            <Input value={name} onChange={(e) => dispatch({ type: 'set', field: 'name', value: e.target.value })} placeholder="e.g. October recruitment outreach" />
          </div>

          <div>
            <Label>From (your number)</Label>
            {numbers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active phone numbers — provision one first.</p>
            ) : (
              <Select value={fromNumber} onValueChange={(v) => dispatch({ type: 'set', field: 'fromNumber', value: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {numbers.map((n) => (
                    <SelectItem key={n._id} value={n.phoneNumber}>
                      {n.friendlyName ?? n.phoneNumber} ({n.phoneNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Calls per minute</Label>
              <Input
                type="number"
                value={callsPerMinute}
                onChange={(e) => dispatch({ type: 'set', field: 'callsPerMinute', value: e.target.value })}
              />
            </div>
            <div className="flex items-end justify-between">
              <Label htmlFor="bulk-record">Record calls</Label>
              <Switch id="bulk-record" checked={recordCall} onCheckedChange={(v) => dispatch({ type: 'setRecordCall', value: v })} />
            </div>
          </div>

          <div>
            <Label>AI script / prompt (optional)</Label>
            <Textarea
              value={script}
              onChange={(e) => dispatch({ type: 'set', field: 'script', value: e.target.value })}
              placeholder="Hi {firstName}, I'm calling from Acme regarding…"
              rows={3}
            />
          </div>

          <div>
            <Label>Pick contacts</Label>
            <Input
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="border rounded-md mt-2 max-h-48 overflow-y-auto divide-y">
              {contacts.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No contacts.</div>
              ) : (
                contacts.map((c) => (
                  <label
                    key={c._id}
                    className="flex items-center gap-2 p-2 hover:bg-muted/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c._id)}
                      onChange={() => toggle(c._id)}
                    />
                    <span className="flex-1 text-sm">
                      {c.firstName} {c.lastName ?? ''}
                      {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedIds.size} selected
            </p>
          </div>

          <div>
            <Label>Or paste CSV (one E.164 number per line, optional comma + name)</Label>
            <Textarea
              value={csvInput}
              onChange={(e) => dispatch({ type: 'set', field: 'csvInput', value: e.target.value })}
              placeholder={`+14155551234, Alice\n+14155557777, Bob`}
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !fromNumber || (selectedIds.size === 0 && !csvInput.trim())}
          >
            {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
            Start Batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
