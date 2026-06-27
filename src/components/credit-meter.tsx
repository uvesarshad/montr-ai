'use client';

import React from 'react';
import { RefreshCw, Zap } from 'lucide-react';

import { useCredits } from '@/hooks/use-credits';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface CreditMeterProps {
  variant?: 'sidebar' | 'header';
  isCollapsed?: boolean;
  className?: string;
}

export function CreditMeter({ variant = 'sidebar', isCollapsed = false, className }: CreditMeterProps) {
  const { credits, isLoading, refetch } = useCredits();

  if (isLoading) {
    if (variant === 'header') {
      return <Skeleton className="h-6 w-20 rounded-full" />;
    }
    return isCollapsed ? <Skeleton className="size-8 rounded-lg" /> : <Skeleton className="h-12 w-full rounded-[10px]" />;
  }

  if (!credits || !credits.hasActiveSubscription) {
    return null;
  }

  const { remaining, totalAllocated } = credits;
  const percentage = totalAllocated > 0 ? Math.round((remaining / totalAllocated) * 100) : 0;
  const usedPercentage = Math.min(100, Math.max(0, 100 - percentage));
  const isLow = percentage < 20;
  const isCritical = percentage < 10;

  const statusColorClass = isCritical
    ? 'text-destructive'
    : isLow
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-primary';

  // Mockup `.credit-num` shows k-figures ("35.8k credits").
  const remainingLabel = remaining >= 1000 ? `${(remaining / 1000).toFixed(1)}k` : remaining.toLocaleString();

  // Real per-type usage → the mockup popover's segmented bar + breakdown.
  const usageSegments = [
    { label: 'Text', used: credits.usageByType?.text ?? 0, color: 'hsl(var(--brand))' },
    { label: 'Image', used: credits.usageByType?.image ?? 0, color: 'hsl(var(--brand-strong))' },
    { label: 'Video', used: credits.usageByType?.video ?? 0, color: 'hsl(var(--info-h))' },
    { label: 'Scraping', used: credits.usageByType?.scraping ?? 0, color: 'hsl(var(--warning))' },
  ].filter((segment) => segment.used > 0);

  if (variant === 'header') {
    return (
      <div className={cn('group relative', className)}>
        {/* Mockup `.credit-info` — bolt + figures + mini usage bar (info element) */}
        <div className="flex h-8 cursor-default items-center gap-2 rounded-md px-1.5" tabIndex={0}>
          <span
            className={cn(
              'grid h-[22px] w-[22px] shrink-0 place-items-center',
              isCritical ? 'text-destructive' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-brand',
            )}
          >
            <Zap className="size-3.5" strokeWidth={1.7} />
          </span>
          <span className="flex flex-col items-start gap-[3px] leading-none">
            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
              {remainingLabel} <span className="font-medium text-muted-foreground">credits</span>
            </span>
            <span className="h-[3px] w-[52px] overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full',
                  isCritical ? 'bg-destructive' : isLow ? 'bg-amber-500' : 'bg-brand',
                )}
                style={{ width: `${usedPercentage}%` }}
              />
            </span>
          </span>
        </div>

        {/* Detailed overview on hover — mockup `.pop-credit` */}
        <div className="invisible absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] translate-y-1 overflow-hidden rounded-[10px] border border-border bg-popover text-popover-foreground opacity-0 shadow-[var(--app-shadow-strong)] transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
          <div className="px-4 pb-3 pt-3.5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] font-semibold text-muted-foreground">AI Credits</div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className={cn('font-mono text-[23px] font-semibold tracking-[-0.02em] tabular-nums', statusColorClass)}>
                    {remaining.toLocaleString()}
                  </span>
                  <span className="text-[12px] text-muted-foreground">/ {totalAllocated.toLocaleString()} left</span>
                </div>
              </div>
              {credits.hasActiveSubscription ? (
                <span className="inline-flex h-5 items-center rounded-full bg-brand-muted px-2 text-[12px] font-medium text-brand-strong">
                  Active plan
                </span>
              ) : null}
            </div>
            {/* segmented usage bar — real per-type data */}
            <div className="mt-3 flex h-2 overflow-hidden rounded-[6px] bg-muted">
              {usageSegments.map((segment) => (
                <span
                  key={segment.label}
                  title={segment.label}
                  className="h-full"
                  style={{ width: `${(segment.used / Math.max(totalAllocated, 1)) * 100}%`, background: segment.color }}
                />
              ))}
            </div>
            <div className="mt-[7px] flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span>{usedPercentage}% used this cycle</span>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isLoading}
                title="Refresh credits"
                className="inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground"
              >
                <RefreshCw className={cn('size-3', isLoading && 'animate-spin')} />
                {credits.periodEnd ? `Resets ${new Date(credits.periodEnd).toLocaleDateString()}` : 'Resets monthly'}
              </button>
            </div>
          </div>
          {usageSegments.length > 0 ? (
            <div className="border-t border-border px-4 pb-3 pt-2.5">
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Usage by type
              </div>
              <div className="flex flex-col gap-2">
                {usageSegments.map((segment) => (
                  <div key={segment.label} className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: segment.color }} />
                    <span className="text-muted-foreground">{segment.label}</span>
                    <span className="ml-auto font-mono text-[12px] font-semibold tabular-nums text-foreground">
                      {segment.used >= 1000 ? `${(segment.used / 1000).toFixed(1)}k` : segment.used.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-2 border-t border-border bg-[var(--app-bg)] px-3 py-2.5">
            <a
              href="/settings?tab=billing"
              className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full border border-input bg-card text-[12.5px] font-medium text-foreground shadow-btn transition-colors hover:bg-muted"
            >
              Top up
            </a>
            <a
              href="/pricing"
              className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-medium text-white shadow-btn transition-opacity hover:opacity-90"
              style={{
                backgroundImage: 'linear-gradient(180deg, oklch(0.3 0.012 280), oklch(0.2 0.008 280))',
                border: '1px solid oklch(0.14 0.006 280)',
              }}
            >
              Upgrade plan
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-[8px] border border-transparent',
                'text-[color:var(--app-text-muted)] transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5',
                className,
              )}
            >
              <Zap className={cn('size-4', statusColorClass)} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{remaining.toLocaleString()} / {totalAllocated.toLocaleString()} credits</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'rounded-[10px] border border-white/45 bg-white/35 px-3 py-2.5 shadow-[0_8px_22px_-20px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.04]',
              className,
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[10.5px] font-medium text-[color:var(--app-text-muted)]">AI Credits</span>
              <div className="flex items-center gap-1.5">
                <span className={cn('text-[10.5px] font-semibold', statusColorClass)}>
                  {remaining.toLocaleString()}
                </span>
                <span className="text-[10.5px] text-[color:var(--app-text-faint)]">/ {totalAllocated.toLocaleString()}</span>
              </div>
            </div>
            <Progress
              value={percentage}
              className={cn(
                'h-[3px] bg-black/[0.06] dark:bg-white/[0.08]',
                isCritical && '[&>div]:bg-destructive',
                isLow && !isCritical && '[&>div]:bg-amber-500',
              )}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-[color:var(--app-text-faint)]">
                {credits.periodEnd ? `Resets ${new Date(credits.periodEnd).toLocaleDateString()}` : 'Subscription active'}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  refetch();
                }}
                className="rounded-[6px] p-1 text-[color:var(--app-text-muted)] transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                disabled={isLoading}
                title="Refresh credits"
              >
                <RefreshCw className={cn('size-3', isLoading && 'animate-spin')} />
              </button>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{remaining.toLocaleString()} / {totalAllocated.toLocaleString()} credits</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
