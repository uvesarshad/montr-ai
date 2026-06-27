'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';

import { useCurrentBrand } from '@/hooks/use-current-brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BulkBatchCreateDialog } from '@/components/voice/bulk-batch-create-dialog';
import { Phone, Plus } from 'lucide-react';

interface BatchSummary {
  _id: string;
  name: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  totals: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    noAnswer: number;
    voicemail: number;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

export default function BulkDialerListClient() {
  const { currentBrandId } = useCurrentBrand();
  const listUrl = `/api/v2/voice/bulk-calls${
    currentBrandId === null ? '' : `?brandId=${encodeURIComponent(currentBrandId)}`
  }`;
  const { data, isLoading, mutate } = useSWR<{ data: BatchSummary[] }>(
    listUrl,
    fetcher,
    { refreshInterval: 5000 },
  );
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1" /> New Batch
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !data?.data || data.data.length === 0 ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground text-sm">
          No bulk dialing batches yet.
        </div>
      ) : (
        <ul className="divide-y border rounded-md">
          {data.data.map((b) => (
            <li key={b._id} className="p-4">
              <Link
                href={`/crm/voice/bulk/${b._id}`}
                className="flex items-center gap-4 hover:bg-muted/40 -mx-4 px-4 py-2 rounded"
              >
                <Phone className="size-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.totals.completed}/{b.totals.total} done ·{' '}
                    {b.totals.failed} failed · {b.totals.inProgress} in progress ·{' '}
                    created {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <Badge variant={b.status === 'completed' ? 'secondary' : 'outline'}>
                  {b.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BulkBatchCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultBrandId={currentBrandId}
        onCreated={() => {
          mutate();
          setCreateOpen(false);
        }}
      />
    </div>
  );
}
