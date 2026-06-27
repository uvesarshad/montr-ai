'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DealFilters, useDeals } from '@/hooks/crm/use-deals';
import { CrmDataGrid } from '@/components/crm/shared/crm-data-grid';
import { CrmPagination } from '@/components/crm/shared/crm-pagination';
import { RecordPreviewPanel } from '@/components/crm/shared/record-preview-panel';
import { getDealColumns } from './deal-table-columns';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

import type { CrmDataGridGroupBy } from '@/components/crm/shared/crm-data-grid';
import type { Deal } from '@/types/crm';

interface DealListViewProps {
  filters: DealFilters;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  /** Field to group the current page of deals by (client-side). */
  groupByField?: string;
}

function formatDealSum(sum: number, rows: Deal[]) {
  const currency = rows[0]?.currency || 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(sum);
}

export function DealListView({ filters, onPageChange, onLimitChange, groupByField }: DealListViewProps) {
  const { deals, loading, error, pagination } = useDeals(filters);
  const columns = getDealColumns();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const groupBy: CrmDataGridGroupBy<Deal> | undefined = groupByField
    ? {
        key: groupByField,
        sumKey: 'value',
        formatSum: formatDealSum,
      }
    : undefined;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CrmDataGrid
        columns={columns}
        data={deals}
        loading={loading}
        getRowId={(row) => row._id}
        groupBy={groupBy}
        onRowClick={(deal) => setPreviewId(deal._id)}
        emptyMessage="No deals found"
        emptyDescription="Try broadening your filters or create a new opportunity."
        mobileCard={(deal) => (
          <Link href={`/crm/deals/${deal._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
            <div className="size-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{deal.name}</p>
              <p className="text-xs text-muted-foreground">
                {deal.currency} {deal.value?.toLocaleString() ?? '0'}
              </p>
            </div>
            <Badge
              variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
              className="shrink-0 text-xs capitalize"
            >
              {deal.status}
            </Badge>
          </Link>
        )}
      />
      {pagination && pagination.totalPages > 0 ? (
        <CrmPagination
          pagination={pagination}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      ) : null}

      <RecordPreviewPanel
        entityType="deal"
        recordId={previewId}
        open={previewId !== null}
        onOpenChange={(open) => { if (!open) setPreviewId(null); }}
      />
    </div>
  );
}
