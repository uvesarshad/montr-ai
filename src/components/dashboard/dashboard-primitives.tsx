'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function DashboardPanel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Card>) {
  return (
    <Card
      className={cn(
        'app-glass app-glass-hover overflow-hidden rounded-[18px] border-white/45 text-card-foreground',
        className
      )}
      {...props}
    />
  );
}

type DashboardPanelHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function DashboardPanelHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: DashboardPanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-border/50 px-5 py-4',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="app-section-label text-[11px] font-semibold text-muted-foreground/80">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

type DashboardFooterLinkProps = {
  href: string;
  label: string;
  className?: string;
};

export function DashboardFooterLink({
  href,
  label,
  className,
}: DashboardFooterLinkProps) {
  return (
    <CardFooter
      className={cn(
        'border-t border-border/50 bg-white/20 px-4 py-3 dark:bg-white/5',
        className
      )}
    >
      <Link href={href} className="w-full">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-between rounded-[10px] px-3 text-xs text-muted-foreground hover:bg-white/70 hover:text-foreground dark:hover:bg-white/10"
        >
          {label}
          <ArrowRight className="size-3.5" />
        </Button>
      </Link>
    </CardFooter>
  );
}

type DashboardEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

export function DashboardEmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
  className,
}: DashboardEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className
      )}
      >
      <div className="flex size-12 items-center justify-center rounded-[14px] border border-border/50 bg-white/50 text-muted-foreground dark:bg-white/5">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref}>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-[0.4rem] border-border/60 bg-background/70"
          >
            {actionLabel}
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
