'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Users, Handshake, Link2, Plus, X } from 'lucide-react';
import { Card, Chip, IconButton, Spinner, EmptyState, SearchInput } from '@/components/ui-kit';
import { FormDialog, ConfirmDialog } from '@/components/ui-kit';
import { Field, Select } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

type RecordType = 'contact' | 'company' | 'deal';

interface LinkedRecord {
  id: string;
  type: RecordType;
  name: string;
  email?: string;
  value?: number;
  deleted?: boolean;
}

interface RecordLink {
  id: string;
  direction: 'outgoing' | 'incoming';
  linkType: string;
  createdAt: string;
  record: LinkedRecord;
}

const TYPE_META: Record<RecordType, { icon: typeof Users; label: string; path: string }> = {
  contact: { icon: Users, label: 'Contact', path: '/crm/contacts' },
  company: { icon: Building2, label: 'Company', path: '/crm/companies' },
  deal: { icon: Handshake, label: 'Deal', path: '/crm/deals' },
};

const TYPE_OPTIONS = [
  { value: 'contact', label: 'Contact' },
  { value: 'company', label: 'Company' },
  { value: 'deal', label: 'Deal' },
];

const LINK_TYPE_OPTIONS = [
  { value: 'related', label: 'Related' },
  { value: 'referred_by', label: 'Referred by' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'duplicate_of', label: 'Duplicate of' },
];

function prettyLinkType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SEARCH_ENDPOINT: Record<RecordType, string> = {
  contact: '/api/v2/crm/contacts',
  company: '/api/v2/crm/companies',
  deal: '/api/v2/crm/deals',
};

function recordDisplayName(type: RecordType, r: Record<string, unknown>): string {
  if (type === 'contact') {
    return `${(r.firstName as string) || ''} ${(r.lastName as string) || ''}`.trim() || 'Unnamed';
  }
  return (r.name as string) || 'Unnamed';
}

interface RelatedRecordsProps {
  recordType: RecordType;
  recordId: string;
}

export function RelatedRecords({ recordType, recordId }: RelatedRecordsProps) {
  const { toast } = useToast();
  const [links, setLinks] = useState<RecordLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  // Add-dialog state
  const [targetType, setTargetType] = useState<RecordType>('contact');
  const [linkType, setLinkType] = useState('related');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v2/crm/links?recordType=${recordType}&recordId=${recordId}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const json = await res.json();
        setLinks(json.data || []);
      }
    } catch {
      // silent — surfaced on action
    } finally {
      setLoading(false);
    }
  }, [recordType, recordId]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search-as-you-type record picker.
  useEffect(() => {
    if (!addOpen) return;
    const q = query.trim();
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `${SEARCH_ENDPOINT[targetType]}?search=${encodeURIComponent(q)}&limit=8`,
          { credentials: 'include' }
        );
        if (res.ok && !cancelled) {
          const json = await res.json();
          const rows = (json.data || [])
            .filter((r: Record<string, unknown>) => {
              // exclude self
              return !(targetType === recordType && String(r._id) === recordId);
            })
            .map((r: Record<string, unknown>) => ({
              id: String(r._id),
              name: recordDisplayName(targetType, r),
            }));
          setResults(rows);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, targetType, addOpen, recordType, recordId]);

  const resetDialog = () => {
    setTargetType('contact');
    setLinkType('related');
    setQuery('');
    setResults([]);
    setPicked(null);
  };

  const handleCreate = async () => {
    if (!picked) {
      toast({ variant: 'destructive', title: 'Pick a record to link' });
      throw new Error('no record');
    }
    const res = await fetch('/api/v2/crm/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        sourceType: recordType,
        sourceId: recordId,
        targetType,
        targetId: picked.id,
        linkType,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ variant: 'destructive', title: 'Failed to link', description: err.error });
      throw new Error(err.error || 'failed');
    }
    toast({ title: 'Record linked' });
    resetDialog();
    await load();
  };

  const handleRemove = async () => {
    if (!removeId) return;
    const res = await fetch(`/api/v2/crm/links/${removeId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ variant: 'destructive', title: 'Failed to remove link', description: err.error });
      throw new Error('failed');
    }
    setRemoveId(null);
    toast({ title: 'Link removed' });
    await load();
  };

  const addButton = (
    <button
      type="button"
      onClick={() => setAddOpen(true)}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand-strong hover:bg-brand-muted"
    >
      <Plus className="size-3.5" /> Link record
    </button>
  );

  return (
    <>
      <Card icon={Link2} title="Related records" action={addButton}>
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : links.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="No linked records"
            note="Connect this record to related contacts, companies, or deals."
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {links.map((l) => {
              const meta = TYPE_META[l.record.type];
              const Icon = meta.icon;
              return (
                <li
                  key={l.id}
                  className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {l.record.deleted ? (
                      <span className="text-[13px] text-muted-foreground line-through">
                        {l.record.name}
                      </span>
                    ) : (
                      <Link
                        href={`${meta.path}/${l.record.id}`}
                        className="block truncate text-[13px] font-medium text-foreground hover:text-brand-strong"
                      >
                        {l.record.name}
                      </Link>
                    )}
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {l.record.email ||
                        (typeof l.record.value === 'number'
                          ? `$${l.record.value.toLocaleString()}`
                          : meta.label)}
                    </span>
                  </div>
                  <Chip tone="gray">{prettyLinkType(l.linkType)}</Chip>
                  <IconButton
                    icon={X}
                    iconSize={14}
                    aria-label="Remove link"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => setRemoveId(l.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <FormDialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetDialog();
        }}
        title="Link a record"
        icon={Link2}
        submitLabel="Link"
        submitDisabled={!picked}
        onSubmit={handleCreate}
      >
        <Field label="Record type">
          <Select
            options={TYPE_OPTIONS}
            value={targetType}
            onChange={(v) => {
              setTargetType(v as RecordType);
              setPicked(null);
              setResults([]);
            }}
          />
        </Field>

        <Field label="Find record">
          <SearchInput
            placeholder="Search by name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
          />
          <div className="mt-1.5 max-h-48 overflow-y-auto rounded-md border border-input">
            {searching ? (
              <div className="flex justify-center py-3">
                <Spinner size={13} />
              </div>
            ) : results.length === 0 ? (
              <p className="px-2.5 py-3 text-[12.5px] text-muted-foreground">No matches.</p>
            ) : (
              <ul>
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(r)}
                      className={`flex w-full items-center px-2.5 py-1.5 text-left text-[13px] hover:bg-muted ${
                        picked?.id === r.id ? 'bg-brand-muted text-brand-strong' : ''
                      }`}
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <Field label="Relationship">
          <Select options={LINK_TYPE_OPTIONS} value={linkType} onChange={setLinkType} />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title="Remove link"
        description="This removes the association. The records themselves are not deleted."
        confirmLabel="Remove"
        onConfirm={handleRemove}
      />
    </>
  );
}
