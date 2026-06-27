'use client';

/**
 * DealRecordKanban — deals boarded by a non-stage select field
 * (status / priority / owner) using the shared `RecordKanban`. The classic
 * `DealKanban` still owns the default stage board; this kicks in when the
 * deals page Group-by is set to something other than Stage.
 *
 * Moves PATCH `/api/v2/crm/deals/[id]` with the relevant field
 * (status / priority / ownerId). Aggregates sum of deal `value` (currency).
 */

import * as React from 'react';
import { toast } from 'sonner';

import { useDeals, DealFilters } from '@/hooks/crm/use-deals';
import { RecordKanban } from '@/components/crm/shared/record-kanban';
import { getKanbanColumns } from '@/components/crm/shared/groupable-fields';
import { Spinner } from '@/components/ui-kit';
import type { Deal } from '@/types/crm';

interface PopulatedOwner {
  _id?: string;
  firstName?: string;
  lastName?: string;
}

interface DealRecordKanbanProps {
  /** 'status' | 'priority' | 'ownerId' (stage is handled by DealKanban). */
  groupByField: 'status' | 'priority' | 'ownerId';
  filters: DealFilters;
  onItemClick?: (deal: Deal) => void;
}

function ownerValue(deal: Deal): string | undefined {
  const o = deal.ownerId as string | PopulatedOwner | undefined;
  if (!o) return undefined;
  return typeof o === 'object' ? o._id : o;
}

function ownerLabel(deal: Deal): string | undefined {
  const o = deal.ownerId as string | PopulatedOwner | undefined;
  if (o && typeof o === 'object') {
    return [o.firstName, o.lastName].filter(Boolean).join(' ') || o._id;
  }
  return o;
}

const currencyFmt = (total: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(total);

export function DealRecordKanban({ groupByField, filters, onItemClick }: DealRecordKanbanProps) {
  const { deals, loading, pagination, refetch } = useDeals(filters);

  // Owner columns need labels derived from data; status/priority use presets.
  const presets = getKanbanColumns('deal', groupByField);
  const columns = React.useMemo(() => {
    if (presets) return presets;
    if (groupByField === 'ownerId') {
      const seen = new Map<string, string>();
      for (const d of deals) {
        const v = ownerValue(d);
        if (v && !seen.has(v)) seen.set(v, ownerLabel(d) || 'Owner');
      }
      return [...seen.entries()].map(([value, label]) => ({ value, label }));
    }
    return undefined;
  }, [presets, groupByField, deals]);

  const handleMove = React.useCallback(
    async (deal: Deal, toColumnValue: string) => {
      const body: Record<string, unknown> =
        groupByField === 'ownerId'
          ? { ownerId: toColumnValue }
          : { [groupByField]: toColumnValue };
      const res = await fetch(`/api/v2/crm/deals/${deal._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update deal');
      toast.success('Deal moved');
      void refetch();
    },
    [groupByField, refetch],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Spinner size={20} />
      </div>
    );
  }

  const total = pagination?.total;
  const note =
    total != null && deals.length < total
      ? `Showing first ${deals.length} of ${total} deals`
      : undefined;

  return (
    <RecordKanban<Deal>
      items={deals}
      groupKey={groupByField}
      columns={columns}
      getId={(d) => d._id}
      getGroupValue={groupByField === 'ownerId' ? ownerValue : undefined}
      getLabel={(d) => d.name}
      getSubtitle={(d) =>
        `${d.currency || 'USD'} ${(d.value ?? 0).toLocaleString()}`
      }
      aggregate={{ sumKey: 'value', format: currencyFmt }}
      onItemClick={onItemClick}
      onMoveItem={handleMove}
      note={note}
    />
  );
}
