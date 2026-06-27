'use client';

import { Badge } from '@/components/ui/badge';
import { DealPriority } from '@/types/crm';
import { cn } from '@/lib/utils';
import { AlertCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface DealPriorityBadgeProps {
  priority: DealPriority;
  className?: string;
  showIcon?: boolean;
}

const priorityConfig: Record<
  DealPriority,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  urgent: {
    label: 'Urgent',
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: AlertCircle,
  },
  high: {
    label: 'High',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: ArrowUp,
  },
  medium: {
    label: 'Medium',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: Minus,
  },
  low: {
    label: 'Low',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: ArrowDown,
  },
};

export function DealPriorityBadge({ priority, className, showIcon = false }: DealPriorityBadgeProps) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {showIcon && <Icon className="size-3 mr-1" />}
      {config.label}
    </Badge>
  );
}
