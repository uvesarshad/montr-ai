'use client';

/**
 * DealCalendarView — month calendar of deals plotted by expectedCloseDate.
 * Fetches the visible month's range (org-scoped via the deals API) and renders
 * each deal as a chip coloured by status. Clicking a chip opens the shared
 * RecordPreviewPanel (deal).
 */

import * as React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

import { useDeals, type DealFilters } from '@/hooks/crm/use-deals';
import {
  RecordCalendar,
  type CalendarItem,
} from '@/components/crm/shared/record-calendar';
import { RecordPreviewPanel } from '@/components/crm/shared/record-preview-panel';
import type { Deal, DealStatus } from '@/types/crm';

interface DealCalendarViewProps {
  /** Base list filters (search/owner/priority/tags) to combine with the month range. */
  filters?: Pick<DealFilters, 'search' | 'ownerId' | 'priority' | 'tags'>;
}

const STATUS_CHIP: Record<string, string> = {
  open: 'bg-[var(--accent-100)] text-[var(--accent-700)] border-transparent',
  won: 'bg-emerald-100 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300',
  lost: 'bg-rose-100 text-rose-700 border-transparent dark:bg-rose-500/15 dark:text-rose-300',
};

function chipFor(status?: DealStatus): string | undefined {
  return status ? STATUS_CHIP[status] : undefined;
}

function fmtValue(deal: Deal): string {
  if (!deal.value) return deal.name;
  const v = deal.value.toLocaleString();
  return `${deal.name} · ${deal.currency || ''}${v}`.trim();
}

export function DealCalendarView({ filters }: DealCalendarViewProps) {
  const [month, setMonth] = React.useState(() => new Date());
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  // Fetch the full visible grid range (covers leading/trailing days of adjacent months).
  const range = React.useMemo(() => {
    const ms = startOfMonth(month);
    return {
      after: startOfWeek(ms, { weekStartsOn: 0 }),
      before: endOfWeek(endOfMonth(ms), { weekStartsOn: 0 }),
    };
  }, [month]);

  const dealFilters = React.useMemo<DealFilters>(
    () => ({
      limit: 100,
      sort: 'expectedCloseDate',
      search: filters?.search || undefined,
      ownerId: filters?.ownerId,
      priority: filters?.priority,
      tags: filters?.tags && filters.tags.length > 0 ? filters.tags : undefined,
      expectedCloseAfter: range.after,
      expectedCloseBefore: range.before,
    }),
    [filters?.search, filters?.ownerId, filters?.priority, filters?.tags, range],
  );

  const { deals, loading } = useDeals(dealFilters);

  const items = React.useMemo<CalendarItem[]>(
    () =>
      deals
        .filter((d) => d.expectedCloseDate)
        .map((d) => ({
          id: d._id,
          date: new Date(d.expectedCloseDate as unknown as string),
          label: fmtValue(d),
          color: chipFor(d.status),
        })),
    [deals],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <RecordCalendar
        month={month}
        items={items}
        loading={loading}
        onMonthChange={setMonth}
        onItemClick={(it) => setPreviewId(it.id)}
        emptyLabel="No deals closing this month"
      />
      <RecordPreviewPanel
        entityType="deal"
        recordId={previewId}
        open={!!previewId}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
      />
    </div>
  );
}
