'use client';

/**
 * RecordPreviewPanel — Twenty-style "open record in a side drawer" for CRM
 * lists. Fetches a light summary of a contact / company / deal and renders it
 * in a right-side Sheet so users can preview without leaving the list. Full
 * detail lives on the dedicated route ("Open full page").
 *
 * Composed from the ui-kit (Button/Chip/Avatar/KpiTile/Spinner) over the
 * shadcn Sheet (full-width on mobile by default).
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, Pencil, TrendingUp, User } from 'lucide-react';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Avatar, Button, Chip, KpiTile, Spinner } from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';
import { RunAutomationMenu } from '@/components/crm/run-automation-menu';
import type { Contact, Company, Deal } from '@/types/crm';

export type PreviewEntityType = 'contact' | 'company' | 'deal';

export interface RecordPreviewPanelProps {
  entityType: PreviewEntityType;
  recordId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ENTITY_PATH: Record<PreviewEntityType, string> = {
  contact: 'contacts',
  company: 'companies',
  deal: 'deals',
};

const ENTITY_ICON = {
  contact: User,
  company: Building2,
  deal: TrendingUp,
} as const;

function statusTone(value?: string): ChipTone {
  switch (value) {
    case 'customer':
    case 'won':
      return 'ok';
    case 'churned':
    case 'lost':
    case 'inactive':
      return 'danger';
    case 'lead':
    case 'prospect':
      return 'info';
    default:
      return 'gray';
  }
}

/** Simple label/value definition row. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h4>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function Tags({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {tags.map((t) => (
        <Chip key={t} tone="gray">{t}</Chip>
      ))}
    </div>
  );
}

export function RecordPreviewPanel({ entityType, recordId, open, onOpenChange }: RecordPreviewPanelProps) {
  const { push } = useRouter();

  const {
    data: record = null,
    isLoading: loading,
    error: queryError,
  } = useQuery<Contact | Company | Deal>({
    queryKey: ['crm', 'record-preview', entityType, recordId],
    enabled: open && !!recordId,
    queryFn: async () => {
      const res = await fetch(`/api/v2/crm/${ENTITY_PATH[entityType]}/${recordId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load record');
      return res.json();
    },
  });
  const error = queryError instanceof Error ? queryError.message : queryError ? 'Failed to load' : null;

  const detailHref = recordId ? `/crm/${ENTITY_PATH[entityType]}/${recordId}` : '#';

  const Icon = ENTITY_ICON[entityType];

  let title = '';
  let statusValue: string | undefined;
  if (record) {
    if (entityType === 'contact') {
      const c = record as Contact;
      title = [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Contact';
      statusValue = c.status;
    } else if (entityType === 'company') {
      title = (record as Company).name;
      statusValue = (record as Company).type;
    } else {
      title = (record as Deal).name;
      statusValue = (record as Deal).status;
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[420px]"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border p-4 pr-12">
          {record ? (
            <Avatar name={title} size={40} />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              {title || (loading ? 'Loading…' : 'Record')}
            </div>
            {statusValue ? (
              <div className="mt-1">
                <Chip tone={statusTone(statusValue)} className="capitalize">{statusValue}</Chip>
              </div>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Spinner size={20} />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : record ? (
            <div className="space-y-4">
              {entityType === 'contact' && <ContactBody contact={record as Contact} />}
              {entityType === 'company' && <CompanyBody company={record as Company} />}
              {entityType === 'deal' && <DealBody deal={record as Deal} />}
            </div>
          ) : null}
        </div>

        {/* Footer / actions */}
        <div className="flex items-center gap-2 border-t border-border bg-[var(--app-bg)] p-3">
          <Button asChild variant="outline" size="sm" icon={ExternalLink}>
            <Link href={detailHref}>Open full page</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Pencil}
            onClick={() => push(detailHref)}
          >
            Edit
          </Button>
          {recordId ? (
            <div className="ml-auto">
              <RunAutomationMenu
                entityType={entityType}
                recordIds={[recordId]}
                availability="single"
                size="sm"
              />
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------ entity bodies */

function ContactBody({ contact }: { contact: Contact }) {
  const emails = contact.emails?.map((e) => e.value).filter(Boolean) ?? (contact.email ? [contact.email] : []);
  const phones = contact.phones?.map((p) => p.value).filter(Boolean) ?? (contact.phone ? [contact.phone] : []);
  return (
    <>
      <Section title="Details">
        {emails.map((e, i) => (
          <Row key={`e${i}`} label={i === 0 ? 'Email' : ''} value={e} />
        ))}
        {phones.map((p, i) => (
          <Row key={`p${i}`} label={i === 0 ? 'Phone' : ''} value={p} />
        ))}
        <Row label="Job title" value={contact.jobTitle} />
        <Row label="Lifecycle" value={<span className="capitalize">{contact.lifecycle}</span>} />
        <Row label="Rating" value={<span className="capitalize">{contact.rating}</span>} />
        <Row label="Score" value={typeof contact.score === 'number' ? contact.score : undefined} />
      </Section>
      {contact.tags?.length ? (
        <Section title="Tags">
          <Tags tags={contact.tags} />
        </Section>
      ) : null}
    </>
  );
}

function CompanyBody({ company }: { company: Company }) {
  const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '0');
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <KpiTile label="Contacts" value={fmt(company.contactCount)} pastel="blue" />
        <KpiTile label="Deals" value={fmt(company.dealCount)} pastel="violet" />
        <KpiTile label="Deal value" value={fmt(company.totalDealValue)} pastel="mint" />
      </div>
      <Section title="Details">
        <Row label="Domain" value={company.domain || company.website} />
        <Row label="Industry" value={company.industry} />
        <Row label="Type" value={<span className="capitalize">{company.type}</span>} />
        <Row label="Size" value={company.size} />
      </Section>
      {company.tags?.length ? (
        <Section title="Tags">
          <Tags tags={company.tags} />
        </Section>
      ) : null}
    </>
  );
}

function DealBody({ deal }: { deal: Deal }) {
  const closeDate = deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : undefined;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <KpiTile
          label="Value"
          value={`${deal.currency || ''} ${(deal.value ?? 0).toLocaleString()}`.trim()}
          pastel="mint"
        />
        <KpiTile label="Probability" value={`${deal.probability ?? 0}%`} pastel="violet" />
      </div>
      <Section title="Details">
        <Row label="Status" value={<span className="capitalize">{deal.status}</span>} />
        <Row label="Priority" value={<span className="capitalize">{deal.priority}</span>} />
        <Row label="Expected close" value={closeDate} />
        <Row label="Source" value={deal.source} />
      </Section>
      {deal.tags?.length ? (
        <Section title="Tags">
          <Tags tags={deal.tags} />
        </Section>
      ) : null}
    </>
  );
}
