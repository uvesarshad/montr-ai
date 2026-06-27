import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarketingPageInsetProps {
  children: React.ReactNode;
  className?: string;
}

interface MarketingPageProps {
  children: React.ReactNode;
  className?: string;
}

interface MarketingSectionProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

interface MarketingStatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}

interface MarketingEmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function MarketingPageInset({ children, className }: MarketingPageInsetProps) {
  return (
    <div className={cn('px-4 py-4 sm:px-5 sm:py-5 xl:px-6 xl:py-6', className)}>
      {children}
    </div>
  );
}

export function MarketingPage({ children, className }: MarketingPageProps) {
  return <div className={cn('space-y-6', className)}>{children}</div>;
}

export function MarketingSection({
  title,
  description,
  actions,
  children,
  className,
}: MarketingSectionProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card',
        className
      )}
    >
      {(title || description || actions) && (
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function MarketingStatGrid({ children, className }: MarketingPageProps) {
  return <div className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>;
}

export function MarketingStatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: MarketingStatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <div className="font-mono text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
        </div>
        {Icon ? (
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-3 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function MarketingEmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: MarketingEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40 px-6 py-10 text-center',
        className
      )}
    >
      {Icon ? (
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-secondary text-foreground">
          <Icon className="size-6" />
        </span>
      ) : null}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
