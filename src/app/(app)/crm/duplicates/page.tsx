'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ModuleShell } from '@/components/shell/module-shell';
import { Card, Button, Segmented, Spinner, EmptyState } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { CopyCheck, Users } from 'lucide-react';

type EntityType = 'contact' | 'company' | 'deal';

interface DupRecord {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  name?: string;
  domain?: string;
  value?: number;
}

interface Cluster {
  key: Record<string, unknown>;
  criterion: { fields: string[] };
  records: DupRecord[];
}

const ENTITY_OPTIONS = [
  { value: 'contact', label: 'Contacts' },
  { value: 'company', label: 'Companies' },
  { value: 'deal', label: 'Deals' },
];

function recordLabel(entityType: EntityType, r: DupRecord): string {
  if (entityType === 'contact') {
    return [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || r._id;
  }
  return r.name || r.domain || r._id;
}

function recordHref(entityType: EntityType, r: DupRecord): string {
  const seg = entityType === 'contact' ? 'contacts' : entityType === 'company' ? 'companies' : 'deals';
  return `/crm/${seg}/${r._id}`;
}

export default function DuplicatesPage() {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<EntityType>('contact');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/crm/duplicates?entityType=${entityType}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setClusters(data.clusters || []);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to scan duplicates' });
    } finally {
      setLoading(false);
    }
  }, [entityType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Merge is contacts-only — that's the only entity with a merge endpoint.
  const merge = async (keepId: string, records: DupRecord[]) => {
    const sources = records.filter((r) => r._id !== keepId);
    setMerging(keepId);
    try {
      for (const src of sources) {
        const res = await fetch(`/api/v2/crm/contacts/${keepId}/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sourceId: src._id }),
        });
        if (!res.ok) throw new Error();
      }
      toast({ title: 'Contacts merged' });
      await load();
    } catch {
      toast({ variant: 'destructive', title: 'Merge failed' });
    } finally {
      setMerging(null);
    }
  };

  return (
    <ModuleShell
      title="Duplicates"
      icon={CopyCheck}
      meta="Review and resolve suspected duplicate records"
      contentClassName="flex flex-col gap-4 pb-8"
    >
      <Segmented
        options={ENTITY_OPTIONS}
        value={entityType}
        onChange={(v) => setEntityType(v as EntityType)}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : clusters.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No duplicates found"
          note="No records match the active dedupe rules for this entity."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {clusters.map((cluster) => (
            <Card
              key={cluster.criterion.fields.join('+')}
              title={`Matched on ${cluster.criterion.fields.join(' + ')}`}
              meta={`${cluster.records.length} records`}
            >
              <div className="flex flex-col divide-y divide-border">
                {cluster.records.map((r) => (
                  <div key={r._id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={recordHref(entityType, r)}
                        className="truncate font-medium text-foreground hover:text-brand hover:underline"
                      >
                        {recordLabel(entityType, r)}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {[r.email, r.phone, r.domain].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {entityType === 'contact' && cluster.records.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={merging !== null}
                        onClick={() => merge(r._id, cluster.records)}
                      >
                        {merging === r._id ? 'Merging…' : 'Merge into this'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {entityType !== 'contact' && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Merge isn&apos;t available for {entityType}s yet — open each record to
                  reconcile manually.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
