'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
  };
  iconColor?: string;
  iconBgColor?: string;
  onClick?: () => void;
  loading?: boolean;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  iconColor = 'text-blue-500',
  iconBgColor = 'bg-blue-500/10',
  onClick,
  loading = false,
}: StatsCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;

    if (trend.type === 'increase') {
      return <TrendingUp className="size-3" />;
    } else if (trend.type === 'decrease') {
      return <TrendingDown className="size-3" />;
    }
    return <Minus className="size-3" />;
  };

  const getTrendColor = () => {
    if (!trend) return '';

    if (trend.type === 'increase') {
      return 'text-green-600';
    } else if (trend.type === 'decrease') {
      return 'text-red-600';
    }
    return 'text-muted-foreground';
  };

  if (loading) {
    return (
      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          </CardTitle>
          <div className={cn('rounded-lg p-2', iconBgColor)}>
            <div className="size-4 bg-muted animate-pulse rounded" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-20 bg-muted animate-pulse rounded mb-1" />
          <div className="size-32 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-border bg-card transition-colors',
        onClick && 'cursor-pointer hover:bg-secondary/50'
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground">{title}</CardTitle>
        <div className={cn('rounded-lg p-2', iconBgColor)}>
          <Icon className={cn('size-5', iconColor)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-foreground">{value}</div>
        {(subtitle || trend) && (
          <div className="flex items-center gap-2 mt-2">
            {trend && (
              <div className={cn('flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold', getTrendColor())}>
                {getTrendIcon()}
                <span>{trend.value.toFixed(1)}%</span>
              </div>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground font-medium">{subtitle}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
