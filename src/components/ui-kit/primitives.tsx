'use client';

/**
 * ui-kit · primitives — the canonical low-level controls for MontrAI.
 *
 * Ported from the v0.6 design mockup (removed) components/primitives.jsx.
 * Prop-driven, token-styled (bg-card / bg-brand / bg-muted / border / ring …),
 * icons via lucide (pass the icon *component*, e.g. icon={Plus}).
 *
 * Compose UI from these — do not hand-roll buttons/chips/avatars inline.
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import type { LucideIcon } from 'lucide-react';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Separator as ShadSeparator } from '@/components/ui/separator';
import { avatarColor, avatarInitials } from './avatar-helpers';

/* ------------------------------------------------------------------ Button */

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'brand' | 'warm' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (lucide component, e.g. `icon={Plus}`). */
  icon?: LucideIcon;
  /** Trailing icon. */
  iconRight?: LucideIcon;
  /** Animated sheen sweep (primary/brand only). */
  sheen?: boolean;
  /** Render the child element instead (Radix Slot) — e.g. `<Button asChild><Link …>`. */
  asChild?: boolean;
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-[12.5px]',
  md: 'h-8 px-3.5 text-[13px]',
};

// Layered Neutral Surface System: convex (vertical gradient + soft grounding
// shadow, NO top sheen). Colored fills carry `btn-flash` for the hover sweep.
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-flash bg-gradient-to-b from-[hsl(var(--primary-hi))] to-primary text-primary-foreground shadow-btn hover:brightness-110',
  brand: 'btn-flash bg-gradient-to-b from-brand to-brand-strong text-brand-foreground border border-brand-strong shadow-btn hover:brightness-[1.04]',
  warm: 'btn-flash bg-gradient-to-b from-warm to-warm-strong text-warm-foreground border border-warm-strong shadow-btn hover:brightness-[1.04]',
  danger: 'btn-flash bg-gradient-to-b from-[hsl(2_82%_64%)] to-destructive text-destructive-foreground border border-destructive shadow-btn hover:brightness-[1.04]',
  outline: 'bg-gradient-to-b from-card to-muted text-foreground border border-input shadow-btn hover:to-accent',
  ghost: 'bg-transparent text-foreground hover:bg-muted',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'outline',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    sheen,
    asChild,
    className,
    children,
    ...rest
  },
  ref,
) {
  const iconCls = size === 'sm' ? 'size-3.5' : 'h-[15px] w-[15px]';
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(
        'relative isolate inline-flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full font-medium',
        'transition-[transform,box-shadow,filter] duration-200 active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-45',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {asChild ? (
        children
      ) : (
        <>
          {Icon ? <Icon className={cn(iconCls, 'shrink-0')} /> : null}
          {children}
          {IconRight ? <IconRight className={cn(iconCls, 'shrink-0')} /> : null}
          {sheen && (variant === 'primary' || variant === 'brand') ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
              style={{ animation: 'montr-sheen 1.1s linear infinite' }}
            />
          ) : null}
        </>
      )}
    </Comp>
  );
});

/* -------------------------------------------------------------- IconButton */

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  iconSize?: number;
  /** Unread indicator dot. */
  dot?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, iconSize = 18, dot, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...rest}
    >
      <Icon style={{ width: iconSize, height: iconSize }} />
      {dot ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand ring-2 ring-card" /> : null}
    </button>
  );
});

/* --------------------------------------------------------------- Chip/Badge */

export type ChipTone = 'gray' | 'ok' | 'warn' | 'info' | 'danger' | 'brand' | 'purple';

const CHIP_TONES: Record<ChipTone, string> = {
  gray: 'bg-muted text-muted-foreground',
  ok: 'bg-success-muted text-success-foreground',
  warn: 'bg-warning-muted text-warning-foreground',
  info: 'bg-info-muted text-info-foreground',
  danger: 'bg-danger-muted text-danger-foreground',
  brand: 'bg-brand-muted text-brand-strong',
  purple: 'bg-brand-muted text-brand-strong',
};

export interface ChipProps {
  tone?: ChipTone;
  dot?: boolean;
  icon?: LucideIcon;
  /** Makes the chip interactive (renders a <button> with hover/focus states). */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /** Selected state for toggle-chip usage (pairs with onClick). */
  selected?: boolean;
  /** Trailing mono count (tab counts, badge totals). */
  count?: React.ReactNode;
  /** Renders a trailing × that calls this — for removable filter/tag chips. */
  onRemove?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function Chip({ tone = 'gray', dot, icon: Icon, onClick, selected, count, onRemove, className, children }: ChipProps) {
  const Comp: 'button' | 'span' = onClick ? 'button' : 'span';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] font-semibold',
        CHIP_TONES[tone],
        onClick &&
          'cursor-pointer transition-[box-shadow,opacity] hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-1 ring-current',
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {Icon ? <Icon className="size-3" /> : null}
      {children}
      {count != null ? (
        <span className="-mr-0.5 font-mono text-[10.5px] font-medium tabular-nums opacity-70">{count}</span>
      ) : null}
      {onRemove ? (
        <span
          role="button"
          tabIndex={0}
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className="-mr-0.5 ml-0.5 grid size-3.5 cursor-pointer place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-2.5" />
        </span>
      ) : null}
    </Comp>
  );
}

/* --------------------------------------------------------------- BetaBadge */

export type BetaBadgeTone = 'default' | 'onDark';
export type BetaBadgeSize = 'sm' | 'md';

export interface BetaBadgeProps {
  /** Visual tone — `onDark` for the dark Rail, `default` (brand tint) elsewhere. */
  tone?: BetaBadgeTone;
  /** `sm` for dense nav rows, `md` for page headers. */
  size?: BetaBadgeSize;
  /** Override the label (defaults to "Beta"). */
  label?: string;
  className?: string;
}

const BETA_TONES: Record<BetaBadgeTone, string> = {
  default: 'bg-brand-muted text-brand-strong',
  onDark: 'bg-white/10 text-white/70',
};

const BETA_SIZES: Record<BetaBadgeSize, string> = {
  sm: 'h-[15px] px-1.5 text-[9px]',
  md: 'h-[18px] px-2 text-[10px]',
};

/**
 * BetaBadge — a tiny "Beta" pill for non-launch-critical surfaces.
 *
 * Used by the shell (Rail + SubNav) to flag experimental modules; the curated
 * list lives in `@/components/shell/beta-modules`. Also droppable into a
 * `PageHeader` title via the `meta`/title slot.
 */
export function BetaBadge({ tone = 'default', size = 'md', label = 'Beta', className }: BetaBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold uppercase tracking-[0.08em]',
        BETA_TONES[tone],
        BETA_SIZES[size],
        className,
      )}
    >
      {label}
    </span>
  );
}

/* --------------------------------------------------------------- Separator */

export type SeparatorProps = React.ComponentPropsWithoutRef<typeof ShadSeparator>;

/** Hairline divider (Radix underneath) — `orientation="horizontal" | "vertical"`. */
export const Separator = React.forwardRef<React.ElementRef<typeof ShadSeparator>, SeparatorProps>(
  function Separator({ className, ...rest }, ref) {
    return <ShadSeparator ref={ref} className={className} {...rest} />;
  },
);

/* ------------------------------------------------------------------ Avatar */

export interface AvatarProps {
  name?: string;
  size?: number;
  /** Rounded-square instead of circle (workspaces/brands). */
  square?: boolean;
  /** Optional image URL — falls back to deterministic initials. */
  src?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Avatar({ name = '', size = 28, square, src, className, style }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 select-none object-cover', square ? 'rounded-lg' : 'rounded-full', className)}
        style={{ width: size, height: size, ...style }}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-grid shrink-0 select-none place-items-center font-semibold text-white',
        square ? 'rounded-lg' : 'rounded-full',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(name), ...style }}
    >
      {avatarInitials(name)}
    </span>
  );
}

export interface AvatarStackProps {
  names?: string[];
  size?: number;
  max?: number;
}

export function AvatarStack({ names = [], size = 26, max = 5 }: AvatarStackProps) {
  const shown = names.slice(0, max);
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <span
          key={`${n}-${i}`}
          className="rounded-full ring-2 ring-card"
          style={{ marginLeft: i ? -size * 0.3 : 0, zIndex: shown.length - i }}
        >
          <Avatar name={n} size={size} />
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Input/Search */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  /** Trailing icon — interactive when `onTrailingClick` is given (reveal/clear). */
  trailingIcon?: LucideIcon;
  onTrailingClick?: () => void;
  trailingAriaLabel?: string;
  wrapClassName?: string;
}

export function Input({
  icon: Icon,
  trailingIcon: TrailingIcon,
  onTrailingClick,
  trailingAriaLabel,
  className,
  wrapClassName,
  ...rest
}: InputProps) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-2 rounded-md border border-input bg-card px-2.5 transition-colors',
        'focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/40',
        TrailingIcon && 'pr-1',
        wrapClassName,
      )}
    >
      {Icon ? <Icon className="h-[15px] w-[15px] text-muted-foreground" /> : null}
      <input
        className={cn(
          'min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground',
          className,
        )}
        {...rest}
      />
      {TrailingIcon ? (
        onTrailingClick ? (
          <button
            type="button"
            onClick={onTrailingClick}
            aria-label={trailingAriaLabel}
            className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <TrailingIcon className="size-3.5" />
          </button>
        ) : (
          <TrailingIcon className="mr-1 size-3.5 shrink-0 text-muted-foreground" />
        )
      ) : null}
    </div>
  );
}

export function SearchInput(props: InputProps) {
  return <Input icon={Search} placeholder="Search…" {...props} />;
}

/* --------------------------------------------------------------- Segmented */

export type SegmentedOption = string | { value: string; label: React.ReactNode };

export interface SegmentedProps {
  options?: SegmentedOption[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function Segmented({ options = [], value, onChange, className }: SegmentedProps) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5', className)}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const on = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange?.(v)}
            className={cn(
              'h-7 rounded-[7px] px-3 text-[12.5px] font-semibold transition-colors',
              on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- Tabs */

export type TabOption = string | { value: string; label: React.ReactNode };

export interface TabsProps {
  tabs?: TabOption[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs = [], value, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border', className)}>
      {tabs.map((t) => {
        const v = typeof t === 'string' ? t : t.value;
        const label = typeof t === 'string' ? t : t.label;
        const on = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange?.(v)}
            className={cn(
              '-mb-px border-b-2 px-2.5 pb-2.5 pt-1.5 text-[13px] font-semibold capitalize transition-colors',
              on ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Meter/Spinner */

export type MeterTone = 'brand' | 'ok' | 'warn' | 'info' | 'danger';

const METER_TONES: Record<MeterTone, string> = {
  brand: 'bg-brand',
  ok: 'bg-success',
  warn: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-danger',
};

export interface MeterProps {
  value?: number;
  tone?: MeterTone;
  className?: string;
  barClassName?: string;
}

export function Meter({ value = 0, tone = 'brand', className, barClassName }: MeterProps) {
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-muted', className)}>
      <span
        className={cn('block h-full rounded-full', METER_TONES[tone], barClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  );
}

/** Cell-sized labeled mini bar — e.g. open/click rates inside table cells. */
export interface RateBarProps {
  /** 0–100. */
  value?: number;
  tone?: MeterTone;
  /** Bar width in px. */
  barWidth?: number;
  /** Hide the mono % label. */
  hideLabel?: boolean;
  className?: string;
}

export function RateBar({ value = 0, tone = 'brand', barWidth = 44, hideLabel, className }: RateBarProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={cn('inline-flex items-center gap-1.5 align-middle', className)}>
      {!hideLabel ? (
        <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{Math.round(v)}%</span>
      ) : null}
      <span className="inline-block h-[3px] overflow-hidden rounded-full bg-muted" style={{ width: barWidth }}>
        <span className={cn('block h-full rounded-full', METER_TONES[tone])} style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

export interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 14, className }: SpinnerProps) {
  return (
    <span
      className={cn('inline-block animate-spin rounded-full border-2 border-brand border-t-transparent', className)}
      style={{ width: size, height: size }}
    />
  );
}
