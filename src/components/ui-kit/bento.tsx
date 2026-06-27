'use client';

/**
 * ui-kit · bento — a token-themed Bento grid (Aceternity-derived, rethemed to
 * the Layered Neutral Surface System: 16px cards, soft two-layer shadow, neutral
 * borders, restrained hover lift). For overview/feature layouts and rich empty
 * states. Compose `BentoItem`s inside a `BentoGrid`; size with `className`
 * col-span/row-span (e.g. `md:col-span-2`).
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface BentoGridProps {
  className?: string;
  children?: React.ReactNode;
}

export function BentoGrid({ className, children }: BentoGridProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 md:auto-rows-[15rem] md:grid-cols-3', className)}>
      {children}
    </div>
  );
}

export interface BentoItemProps {
  /** Span/size overrides, e.g. `md:col-span-2`. */
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Top media / illustration / chart slot (fills remaining height). */
  header?: React.ReactNode;
  /** Leading icon node (rendered above the title). */
  icon?: React.ReactNode;
  /** Makes the tile interactive (role=button + keyboard + focus ring). */
  onClick?: () => void;
}

export function BentoItem({ className, title, description, header, icon, onClick }: BentoItemProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'group/bento row-span-1 flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card transition duration-200',
        'hover:-translate-y-0.5 hover:border-input hover:shadow-card-hover',
        onClick &&
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {header ? <div className="min-h-0 flex-1">{header}</div> : null}
      <div className="transition duration-200 group-hover/bento:translate-x-1">
        {icon}
        {title ? <div className="mb-1 mt-2 text-sm font-semibold text-foreground">{title}</div> : null}
        {description ? (
          <div className="text-[12.5px] leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
    </div>
  );
}
