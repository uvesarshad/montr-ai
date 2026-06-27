'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowUpRight, BriefcaseBusiness, DollarSign } from 'lucide-react';

import { useDeals } from '@/hooks/crm/use-deals';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DealPriorityBadge } from '@/components/crm/deals/deal-priority-badge';
import { DealStatusBadge } from '@/components/crm/deals/deal-status-badge';
import { buildCompanyDealsSummary } from './company-deals-summary';

interface CompanyDealsTabProps {
  companyId: string;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function CompanyDealsTab({ companyId }: CompanyDealsTabProps) {
  const filters = useMemo(
    () => ({
      companyId,
      limit: 25,
      sort: '-updatedAt',
    }),
    [companyId]
  );

  const { deals, loading, error, refetch } = useDeals(filters);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <Card key={item} className="space-y-3 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col gap-3 p-6 text-center">
        <div className="space-y-1">
          <h3 className="font-medium">Failed to load company deals</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const summary = buildCompanyDealsSummary(deals);

  if (summary.totalDeals === 0) {
    return (
      <Card className="p-8 text-center">
        <BriefcaseBusiness className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h3 className="font-medium">No linked deals yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          New opportunities linked to this company will appear here automatically.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
          <p className="mt-2 text-2xl font-semibold">{summary.openDeals}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCurrency(summary.openValue, summary.sortedDeals[0]?.currency || 'USD')} in pipeline
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Won</p>
          <p className="mt-2 text-2xl font-semibold">{summary.wonDeals}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCurrency(summary.wonValue, summary.sortedDeals[0]?.currency || 'USD')} closed won
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Lost</p>
          <p className="mt-2 text-2xl font-semibold">{summary.lostDeals}</p>
          <p className="mt-1 text-sm text-muted-foreground">Competitive and stalled opportunities</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Abandoned</p>
          <p className="mt-2 text-2xl font-semibold">{summary.abandonedDeals}</p>
          <p className="mt-1 text-sm text-muted-foreground">Inactive or deprioritized work</p>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
        <div>
          <h3 className="font-medium">Related deals</h3>
          <p className="text-sm text-muted-foreground">
            {summary.totalDeals} opportunity{summary.totalDeals === 1 ? '' : 'ies'} linked to this company
          </p>
        </div>
        <Link href="/crm/deals">
          <Button variant="outline" size="sm">
            Open Deals
            <ArrowUpRight className="ml-2 size-4" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {summary.sortedDeals.map((deal) => (
          <Link key={deal._id} href={`/crm/deals/${deal._id}`} className="block">
            <Card className="space-y-3 border-border/60 p-4 transition-colors hover:border-primary/40 hover:bg-accent/30">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <h4 className="truncate font-medium">{deal.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Updated {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DealStatusBadge status={deal.status} />
                  <DealPriorityBadge priority={deal.priority} showIcon />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="size-4" />
                  {formatCurrency(deal.value, deal.currency)}
                </span>
                {deal.expectedCloseDate && (
                  <span>Expected {format(new Date(deal.expectedCloseDate), 'MMM d, yyyy')}</span>
                )}
                <span>{deal.probability}% probability</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
