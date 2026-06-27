'use client';

import { Badge } from '@/components/ui/badge';
import { DealStatus } from '@/types/crm';
import { cn } from '@/lib/utils';

interface DealStatusBadgeProps {
  status: DealStatus;
  className?: string;
}

const statusConfig: Record<
  DealStatus,
  { label: string; className: string }
> = {
  open: {
    label: 'Open',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  won: {
    label: 'Won',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  lost: {
    label: 'Lost',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  abandoned: {
    label: 'Abandoned',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

export function DealStatusBadge({ status, className }: DealStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
