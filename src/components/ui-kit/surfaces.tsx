'use client';

/**
 * ui-kit · surfaces — cards, metric tiles, table, empty/skeleton states.
 *
 * Ported from the v0.6 design mockup (removed) components/surfaces.jsx.
 * Icons via lucide (pass the component). Token-styled.
 */

import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Search, X, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------- Card */

export interface CardProps {
  icon?: LucideIcon;
  title?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  /** Hover-elevate. */
  lift?: boolean;
  /** Cursor-following spotlight glow on hover (Aceternity-style, brand-tinted, sits under content). */
  spotlight?: boolean;
  /** Makes the whole card interactive (adds role=button, keyboard activation, focus ring). */
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Card({ icon: Icon, title, meta, action, footer, lift, spotlight, onClick, className, bodyClassName, children }: CardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const handleMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - r.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - r.top}px`);
  }, []);
  return (
    <div
      ref={ref}
      onMouseMove={spotlight ? handleMove : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      className={cn(
        // Layered Neutral Surface System: 16px cards (rounded-2xl); nested tiles stay 12px (rounded-lg).
        'flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card',
        lift && 'transition hover:-translate-y-0.5 hover:border-input hover:shadow-card-hover',
        spotlight && 'group/spot relative isolate',
        onClick &&
          'cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {/* Cursor-following spotlight glow — sits under content via isolate + -z-10. */}
      {spotlight ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
          style={{
            background:
              'radial-gradient(240px circle at var(--spot-x, 50%) var(--spot-y, 0px), hsl(var(--brand) / 0.10), transparent 72%)',
          }}
        />
      ) : null}
      {title || action ? (
        // mockup .card-head — borderless, 13/16/12 padding, gradient-tint icon square
        <div className="flex items-center gap-2 px-4 pb-3 pt-[13px]">
          {Icon ? (
            <span
              className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-brand-strong"
              style={{
                backgroundImage:
                  'linear-gradient(155deg, color-mix(in srgb, hsl(var(--brand-muted)), #fff 30%), hsl(var(--brand-muted)))',
              }}
            >
              <Icon className="h-[15px] w-[15px]" />
            </span>
          ) : null}
          {title ? <span className="text-sm font-semibold tracking-[-0.015em]">{title}</span> : null}
          {meta ? <span className="text-[12.5px] text-muted-foreground">· {meta}</span> : null}
          {action ? <span className="ml-auto">{action}</span> : null}
        </div>
      ) : null}
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
      {footer ? (
        <div className="flex items-center justify-between border-t border-border bg-[var(--app-bg)] px-4 py-2.5 text-[12.5px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- KpiTile */

export type Pastel = 'violet' | 'mint' | 'blue' | 'peach' | 'rose' | 'lemon';
export type IconTone = 'brand' | 'ok' | 'info' | 'warn';

const PASTELS: Record<Pastel, string> = {
  violet: 'bg-pastel-violet border-pastel-bd-violet',
  mint: 'bg-pastel-mint border-pastel-bd-mint',
  blue: 'bg-pastel-blue border-pastel-bd-blue',
  peach: 'bg-pastel-peach border-pastel-bd-peach',
  rose: 'bg-pastel-rose border-pastel-bd-rose',
  lemon: 'bg-pastel-lemon border-pastel-bd-lemon',
};

const ICON_TONES: Record<IconTone, string> = {
  brand: 'bg-brand-muted text-brand-strong',
  ok: 'bg-success-muted text-success',
  info: 'bg-info-muted text-info',
  warn: 'bg-warning-muted text-warning',
};

export interface KpiTileProps {
  icon?: LucideIcon;
  label?: React.ReactNode;
  value?: React.ReactNode;
  delta?: React.ReactNode;
  up?: boolean;
  /** Muted helper line under the value ("12 awaiting reply", "vs last month"). */
  sub?: React.ReactNode;
  pastel?: Pastel;
  iconTone?: IconTone;
  className?: string;
  children?: React.ReactNode;
}

export function KpiTile({ icon: Icon, label, value, delta, up = true, sub, pastel, iconTone = 'brand', className, children }: KpiTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 overflow-hidden rounded-lg border px-4 pb-2.5 pt-3.5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover',
        pastel ? PASTELS[pastel] : 'border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-muted-foreground">
        {Icon ? (
          <span className={cn('grid h-[22px] w-[22px] place-items-center rounded-md', ICON_TONES[iconTone])}>
            <Icon className="h-[13px] w-[13px]" />
          </span>
        ) : null}
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold tracking-[-0.035em] tabular-nums">{value}</span>
        {delta ? (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', up ? 'text-success' : 'text-danger')}>
            {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {delta}
          </span>
        ) : null}
      </div>
      {sub ? <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div> : null}
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- StatCard */

export interface StatCardProps {
  label?: React.ReactNode;
  value?: React.ReactNode;
  delta?: React.ReactNode;
  up?: boolean;
  /** Optional leading icon chip (matches KpiTile's icon treatment). */
  icon?: LucideIcon;
  iconTone?: IconTone;
  className?: string;
}

export function StatCard({ label, value, delta, up = true, icon: Icon, iconTone = 'brand', className }: StatCardProps) {
  return (
    <div className={cn('py-3.5', className)}>
      <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-muted-foreground">
        {Icon ? (
          <span className={cn('grid h-[22px] w-[22px] place-items-center rounded-md', ICON_TONES[iconTone])}>
            <Icon className="h-[13px] w-[13px]" />
          </span>
        ) : null}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] tabular-nums">{value}</div>
      {delta ? (
        <div className={cn('mt-1 flex items-center gap-1 text-xs', up ? 'text-success' : 'text-danger')}>
          {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {delta}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */

export interface TableColumn<T> {
  key: keyof T & string;
  label: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  mono?: boolean;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

export interface TableProps<T extends Record<string, unknown>> {
  columns: TableColumn<T>[];
  rows: T[];
  onRowClick?: (row: T, id: string | number) => void;
  selectedId?: string | number | null;
  rowKey?: keyof T & string;
  className?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  onRowClick,
  selectedId,
  rowKey,
  className,
}: TableProps<T>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ textAlign: c.align ?? 'left', width: c.width }}
                className="sticky top-0 z-[1] whitespace-nowrap border-b border-border bg-card px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const id = (rowKey ? (row[rowKey] as string | number) : ri);
            const sel = selectedId != null && id === selectedId;
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(row, id) : undefined}
                className={cn(
                  'border-b border-border transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-muted/60',
                  sel && 'bg-brand-muted',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{ textAlign: c.align ?? 'left' }}
                    className={cn('h-[var(--row-h,44px)] px-3 align-middle', c.mono && 'font-mono tabular-nums')}
                  >
                    {c.render ? c.render(row[c.key], row) : (row[c.key] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------- EmptyState */

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: React.ReactNode;
  note?: React.ReactNode;
  cta?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Search, title, note, cta, secondary, className }: EmptyStateProps) {
  return (
    <div className={cn('grid place-items-center p-10', className)}>
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-[26px] w-[26px]" />
        </div>
        <h3 className="text-[17px] font-semibold">{title}</h3>
        {note ? <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{note}</p> : null}
        {cta || secondary ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            {secondary}
            {cta}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('relative animate-pulse overflow-hidden rounded-md bg-muted', className)} />;
}

/* ------------------------------------------------------ CollapsibleSection */

export interface CollapsibleSectionProps {
  title: React.ReactNode;
  icon?: LucideIcon;
  /** Right-aligned header extra (count chip, action). */
  action?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

/** Accordion section — context rails, plan cards, grouped settings. */
export function CollapsibleSection({
  title,
  icon: Icon,
  action,
  defaultOpen = true,
  className,
  bodyClassName,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full select-none items-center gap-2 px-3 py-2.5 text-left"
      >
        {Icon ? (
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-brand-muted text-brand-strong">
            <Icon className="size-3" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]">{title}</span>
        {action ? <span className="shrink-0">{action}</span> : null}
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
      </button>
      {open ? <div className={cn('px-3 pb-3', bodyClassName)}>{children}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Banner */

export type BannerTone = 'info' | 'ok' | 'warn' | 'danger' | 'brand';

const BANNER_TONES: Record<BannerTone, string> = {
  info: 'border-info/25 bg-info-muted text-info-foreground',
  ok: 'border-success/25 bg-success-muted text-success-foreground',
  warn: 'border-warning/25 bg-warning-muted text-warning-foreground',
  danger: 'border-danger/25 bg-danger-muted text-danger-foreground',
  brand: 'border-brand/25 bg-brand-muted text-brand-strong',
};

export interface BannerProps {
  tone?: BannerTone;
  icon?: LucideIcon;
  title?: React.ReactNode;
  /** Action button(s), right-aligned. */
  action?: React.ReactNode;
  /** Renders the dismiss ✕ when provided. */
  onDismiss?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/** Inline alert/callout — announcements, warnings, setup prompts. */
export function Banner({ tone = 'info', icon: Icon, title, action, onDismiss, className, children }: BannerProps) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3', BANNER_TONES[tone], className)}>
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" /> : null}
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div> : null}
      </div>
      {action ? <span className="shrink-0">{action}</span> : null}
      {onDismiss ? (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid size-6 shrink-0 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
