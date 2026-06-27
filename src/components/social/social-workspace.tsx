'use client';

import type { ElementType, ReactNode } from 'react';

import {
  Button as KitButton,
  Card as KitCard,
  EmptyState as KitEmptyState,
  KpiTile,
  type Pastel,
} from '@/components/ui-kit';
// shadcn Button (asChild) stays underneath the kit for link-as-button CTAs,
// which the kit Button intentionally doesn't cover.
import { Button as LinkButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Map the legacy decorative tones onto the ui-kit KpiTile pastel surfaces so
// every consumer inherits the centralized look. `neutral` stays plain (no
// pastel); `red` keeps a semantic rose surface for error/destructive stats.
const TONE_PASTEL: Record<string, Pastel | undefined> = {
  neutral: undefined,
  purple: 'violet',
  blue: 'blue',
  green: 'mint',
  amber: 'peach',
  red: 'rose',
};

export function SocialPageLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative space-y-5 px-4 py-4 pb-10 lg:px-6 lg:py-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SocialStatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  );
}

export function SocialStatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  helper?: string;
  icon: ElementType;
  tone?: keyof typeof TONE_PASTEL;
}) {
  return (
    <KpiTile
      icon={Icon as never}
      label={label}
      value={value}
      pastel={TONE_PASTEL[tone]}
    >
      {helper ? (
        <p className="mt-1 text-[12.5px] text-muted-foreground">{helper}</p>
      ) : null}
    </KpiTile>
  );
}

export function SocialPanel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <KitCard
      title={title}
      meta={description}
      action={action}
      className={className}
      bodyClassName={cn('border-t border-border p-4 lg:p-5', contentClassName)}
    >
      {children}
    </KitCard>
  );
}

export function SocialToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-card lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SocialSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SocialEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ElementType;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}) {
  const cta = action ? (
    action.href ? (
      <LinkButton asChild size="sm">
        <a href={action.href}>{action.label}</a>
      </LinkButton>
    ) : (
      <KitButton variant="primary" size="md" onClick={action.onClick}>
        {action.label}
      </KitButton>
    )
  ) : null;

  return (
    <KitEmptyState
      icon={Icon as never}
      title={title}
      note={description}
      cta={cta}
      className="min-h-[280px]"
    />
  );
}
