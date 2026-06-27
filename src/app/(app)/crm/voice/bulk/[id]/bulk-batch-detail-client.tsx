'use client';

import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';

interface Entry {
  _id?: string;
  contactId?: string | null;
  phoneNumber: string;
  status: 'pending' | 'placing' | 'in_progress' | 'completed' | 'failed' | 'no_answer' | 'voicemail';
  callSessionId?: string | null;
  startedAt?: string;
  endedAt?: string;
  durationSec?: number;
  errorMessage?: string;
}

interface BatchDoc {
  _id: string;
  name: string;
  description?: string;
  fromNumber: string;
  status: string;
  callsPerMinute: number;
  totals: {
    total: number;
    pending: number;
    placing: number;
    inProgress: number;
    completed: number;
    failed: number;
    noAnswer: number;
    voicemail: number;
  };
  entries: Entry[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

export default function BulkBatchDetailClient({ batchId }: { batchId: string }) {
  const { data, isLoading } = useSWR<{ data: BatchDoc }>(
    `/api/v2/voice/bulk-calls/${batchId}`,
    fetcher,
    { refreshInterval: 3000 },
  );

  if (isLoading) return <Skeleton className="h-64 w-full m-6" />;
  if (!data?.data) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p>Batch not found.</p>
        <Button asChild className="mt-4">
          <Link href="/crm/voice/bulk">
            <ArrowLeft className="mr-2 size-4" /> Back
          </Link>
        </Button>
      </div>
    );
  }

  const b = data.data;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/crm/voice/bulk">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{b.name}</h1>
          {b.description && (
            <p className="text-sm text-muted-foreground">{b.description}</p>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            From {b.fromNumber} · {b.callsPerMinute}/min · created{' '}
            {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}
          </div>
        </div>
        <Badge variant={b.status === 'completed' ? 'secondary' : 'outline'}>{b.status}</Badge>
      </div>

      <div className="grid grid-cols-4 gap-4 text-center">
        <Stat label="Total" value={b.totals.total} />
        <Stat label="Completed" value={b.totals.completed} />
        <Stat label="In progress" value={b.totals.inProgress + b.totals.placing} />
        <Stat label="Failed" value={b.totals.failed} />
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="text-left p-2">Phone</th>
              <th className="text-left p-2">Status</th>
              <th className="text-right p-2">Duration</th>
              <th className="text-left p-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {b.entries.map((e, i) => (
              <tr key={e._id ?? i}>
                <td className="p-2 font-mono text-xs">
                  {e.callSessionId ? (
                    <Link href={`/crm/voice/calls/${e.callSessionId}`} className="hover:underline">
                      {e.phoneNumber}
                    </Link>
                  ) : (
                    e.phoneNumber
                  )}
                </td>
                <td className="p-2">
                  <Badge variant={
                    e.status === 'completed' ? 'secondary'
                    : e.status === 'failed' ? 'destructive'
                    : 'outline'
                  }>
                    {e.status}
                  </Badge>
                </td>
                <td className="p-2 text-right">
                  {typeof e.durationSec === 'number'
                    ? `${Math.floor(e.durationSec / 60)}:${(e.durationSec % 60).toString().padStart(2, '0')}`
                    : '—'}
                </td>
                <td className="p-2 text-xs text-muted-foreground truncate max-w-xs">
                  {e.errorMessage ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-md p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
