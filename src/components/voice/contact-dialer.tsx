/**
 * Contact dialer dialog (V-8.3).
 *
 * Wraps `POST /api/v2/voice/calls`. Caller picks the outbound number (from)
 * from owned numbers, types or confirms the destination, optionally enables
 * recording. Live status is broadcast via Socket.io (`voice:call:<id>`); the
 * dialer subscribes once the call is placed so the user sees ringing/answered
 * state without polling.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { useCurrentBrand } from '@/hooks/use-current-brand';
import { useSocket } from '@/hooks/use-socket';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PhoneOff } from 'lucide-react';

interface OwnedNumber {
  _id: string;
  phoneNumber: string;
  friendlyName?: string;
  providerId: string;
  brandId?: string | null;
}

interface ContactInfo {
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

export function ContactDialer({
  contactId,
  open,
  onOpenChange,
  onCallPlaced,
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCallPlaced?: () => void;
}) {
  const { toast } = useToast();
  const { currentBrandId } = useCurrentBrand();
  const { data: contactData } = useSWR<{ data?: ContactInfo } | ContactInfo>(
    open ? `/api/v2/crm/contacts/${contactId}` : null,
    fetcher,
  );
  const brandFilter = currentBrandId
    ? `&brandId=${encodeURIComponent(currentBrandId)}`
    : '';
  const { data: numbersData } = useSWR<{ data: OwnedNumber[] }>(
    open ? `/api/v2/voice/numbers?status=active${brandFilter}` : null,
    fetcher,
  );

  const contact = (contactData as { data?: ContactInfo })?.data
    ?? (contactData as ContactInfo)
    ?? null;
  const numbers = useMemo(() => numbersData?.data ?? [], [numbersData]);

  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [recordCall, setRecordCall] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [liveSegments, setLiveSegments] = useState<Array<{
    speaker: string;
    text: string;
    startSec: number;
    at: string;
  }>>([]);

  useEffect(() => {
    if (open && contact?.phone && !to) {
      setTo(contact.phone);
    }
    if (open && numbers.length > 0 && !from) {
      setFrom(numbers[0].phoneNumber);
    }
  }, [open, contact, numbers, to, from]);

  // Live transcript subscription (V-8.3). Joins voice:call:<id> once the
  // outbound call is placed; engine broadcasts transcript.segment events on
  // each STT-finalized line. Status events also flow through.
  const { socket, isConnected } = useSocket({ autoConnect: !!callSessionId });
  useEffect(() => {
    if (!socket || !isConnected || !callSessionId) return;
    socket.emit('join:voice-call', callSessionId);
    const onEvent = (envelope: {
      callSessionId: string;
      event: {
        type: string;
        speaker?: string;
        text?: string;
        startSec?: number;
        at?: string;
      };
      at: string;
    }) => {
      if (envelope.callSessionId !== callSessionId) return;
      const ev = envelope.event;
      if (ev.type === 'transcript.segment' && ev.text) {
        setLiveSegments((prev) => [
          ...prev,
          {
            speaker: ev.speaker ?? 'unknown',
            text: ev.text!,
            startSec: ev.startSec ?? 0,
            at: envelope.at,
          },
        ]);
      } else if (ev.type.startsWith('call.')) {
        setStatus(ev.type.replace('call.', ''));
      }
    };
    socket.on('voice:event', onEvent);
    return () => {
      socket.off('voice:event', onEvent);
      socket.emit('leave:voice-call', callSessionId);
    };
  }, [socket, isConnected, callSessionId]);

  async function placeCall() {
    setPlacing(true);
    try {
      const res = await fetch('/api/v2/voice/calls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to,
          from,
          fromContactId: contactId,
          brandId: currentBrandId ?? undefined,
          options: { recordCall },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: 'Failed to place call',
          description: body.message ?? body.error,
          variant: 'destructive',
        });
        return;
      }
      setCallSessionId(body.callSessionId);
      setStatus(body.status);
      onCallPlaced?.();
    } finally {
      setPlacing(false);
    }
  }

  function reset() {
    setCallSessionId(null);
    setStatus(null);
    setRecordCall(false);
    setLiveSegments([]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Call {contact?.firstName} {contact?.lastName ?? ''}
          </DialogTitle>
        </DialogHeader>

        {callSessionId ? (
          <div className="space-y-3 py-2">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Call placed</p>
              <p className="text-lg font-medium">Status: {status ?? 'queued'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Live transcript
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-md p-3 text-sm space-y-1">
                {liveSegments.length === 0 ? (
                  <p className="text-muted-foreground italic">
                    Waiting for speech…
                  </p>
                ) : (
                  liveSegments.map((s) => (
                    <div key={`${s.at}-${s.speaker}-${s.startSec}`} className="flex gap-2">
                      <span className="text-xs text-muted-foreground capitalize w-14 shrink-0">
                        {s.speaker}:
                      </span>
                      <span>{s.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="text-center">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <PhoneOff className="size-4 mr-1" /> Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <Label>From (your number)</Label>
                {numbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active phone numbers — provision one in voice settings.
                  </p>
                ) : (
                  <Select value={from} onValueChange={setFrom}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {numbers.map((n) => (
                        <SelectItem key={n._id} value={n.phoneNumber}>
                          {n.friendlyName ?? n.phoneNumber} ({n.providerId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>To (contact)</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="record-call">Record call</Label>
                <Switch
                  id="record-call"
                  checked={recordCall}
                  onCheckedChange={setRecordCall}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={placing}>
                Cancel
              </Button>
              <Button onClick={placeCall} disabled={placing || !from || !to}>
                {placing && <Loader2 className="size-4 mr-1 animate-spin" />}
                Place call
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
