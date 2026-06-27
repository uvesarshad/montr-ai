'use client';

import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Building2, Calendar, CircleDollarSign } from 'lucide-react';

import { Deal } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { DealPriorityBadge } from './deal-priority-badge';
import { DealStatusBadge } from './deal-status-badge';

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getDealColumns(): ColumnDef<Deal>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Deal',
      cell: ({ row }) => {
        const deal = row.original;

        return (
          <Link href={`/crm/deals/${deal._id}`} className="block min-w-0">
            <div className="space-y-1">
              <div className="font-medium">{deal.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{deal.probability}% win rate</Badge>
                {deal.companyId && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="size-3" />
                    Linked account
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'value',
      header: 'Value',
      cell: ({ row, getValue }) => (
        <span className="inline-flex items-center gap-1 font-medium">
          <CircleDollarSign className="size-4 text-muted-foreground" />
          {formatCurrency(getValue() as number, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <DealStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => <DealPriorityBadge priority={row.original.priority} showIcon />,
    },
    {
      accessorKey: 'expectedCloseDate',
      header: 'Expected Close',
      cell: ({ row }) => {
        if (!row.original.expectedCloseDate) {
          return <span className="text-muted-foreground">No target</span>;
        }

        return (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="size-4" />
            {formatDistanceToNow(new Date(row.original.expectedCloseDate), { addSuffix: true })}
          </span>
        );
      },
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.updatedAt), { addSuffix: true })}
        </span>
      ),
    },
  ];
}
