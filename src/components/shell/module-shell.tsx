'use client';

/**
 * ModuleShell — the single module-level layout primitive for MontrAI.
 *
 * One uniform layout for EVERY module: a left sub-rail (the module's sections)
 * + a title strip + the canonical loading / empty / error state templates.
 * The global sidebar is the module *switcher*; this shell carries the
 * intra-module *sections*. Two clean tiers, identical on every surface.
 *
 *   - default      sub-rail (200px) + title strip + content
 *   - no `rail`     title strip + content only (full width)
 *   - `editor`      sub-rail collapses to a slim icon strip and the content
 *                   goes full-bleed — same shell, denser, so editors
 *                   (Automation/Canvas, Docs) still breathe.
 *
 * Styled with the flat mood-board tokens (1px borders, grey `bg-secondary`
 * active pills, no gradients/glow) so it matches the global sidebar/header.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui-kit';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface ModuleCrumb {
  label: string;
  href?: string;
}

export interface ModuleRailItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Static badge content. For live counts, prefer `badgeKey`. */
  badge?: React.ReactNode;
  /**
   * Live-count key resolved against `/api/v2/navigation/counts` by the shell
   * SubNav (see `use-subnav-badges`). When set, the resolved count overrides
   * any static `badge`; a count of 0/undefined hides the badge.
   */
  badgeKey?: string;
  /** Match exactly (no prefix) — use for a module root that shares its prefix. */
  exact?: boolean;
}

export interface ModuleRailGroup {
  label?: string;
  items: ModuleRailItem[];
}

export interface ModuleEmptyState {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export interface ModuleError {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export interface ModuleShellProps {
  title: string;
  icon?: LucideIcon;
  breadcrumb?: ModuleCrumb[];
  meta?: React.ReactNode;
  /** Module name shown at the top of the sub-rail (defaults to nothing). */
  railHeading?: React.ReactNode;
  /** Left sub-nav groups. Omit for a full-width, rail-less surface. */
  rail?: ModuleRailGroup[];
  /** Editor density — collapse the sub-rail to icons and go full-bleed. */
  editor?: boolean;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  filterBar?: React.ReactNode;
  /** Renders the ✨ Ask AI button (left of the primary action) when provided. */
  onAskAI?: () => void;
  askAILabel?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyState?: ModuleEmptyState;
  error?: ModuleError | null;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

function isActivePath(pathname: string, item: ModuleRailItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/**
 * The module sub-rail. Render it inside a module `layout.tsx` for a persistent
 * rail that survives navigation between the module's pages, or let `ModuleShell`
 * render it via its `rail` prop for self-contained single pages.
 *
 * @deprecated For module-level navigation use the shell's gutter SubNav
 * instead — register the module in `@/components/shell/subnav-registry`;
 * `(app)/layout.tsx` renders it outside the content card (mockup `.subnav`).
 * This component remains for the editor icon-strip variant (`collapsed`).
 */
function SubRailNavItem({
  item,
  active,
}: {
  item: ModuleRailItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex h-[33px] items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors',
        active
          ? 'bg-brand-muted text-brand-strong'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0 opacity-80" /> : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge != null ? (
        <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * A collapsible labelled group. Unlabelled groups render their items flat.
 */
function SubRailGroup({
  group,
  pathname,
}: {
  group: ModuleRailGroup;
  pathname: string;
}) {
  const [open, setOpen] = React.useState(true);

  if (!group.label) {
    return (
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <SubRailNavItem key={item.href} item={item} active={isActivePath(pathname, item)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        <span className="font-mono">{group.label}</span>
        <ChevronDown
          className={cn('ml-auto size-3.5 transition-transform', !open && '-rotate-90')}
        />
      </button>
      {open
        ? group.items.map((item) => (
            <SubRailNavItem key={item.href} item={item} active={isActivePath(pathname, item)} />
          ))
        : null}
    </div>
  );
}

export function ModuleSubRail({
  groups,
  heading,
  icon: Icon,
  footer,
  collapsed,
}: {
  groups: ModuleRailGroup[];
  heading?: React.ReactNode;
  icon?: LucideIcon;
  footer?: React.ReactNode;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  // Editor density — slim icon-only strip.
  if (collapsed) {
    return (
      <TooltipProvider delayDuration={150}>
        <aside className="hidden w-[52px] shrink-0 flex-col items-center gap-1 border-r border-border px-1.5 py-4 md:flex">
          {groups.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`} className="flex flex-col items-center gap-0.5">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item);
                const ItemIcon = item.icon;
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-md transition-colors',
                          active
                            ? 'bg-brand-muted text-brand-strong'
                            : 'text-[color:var(--ink-500)] hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {ItemIcon ? <ItemIcon className="h-[15px] w-[15px]" /> : null}
                        <span className="sr-only">{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </aside>
      </TooltipProvider>
    );
  }

  return (
    <aside className="hidden w-[216px] shrink-0 flex-col border-r border-border md:flex">
      {heading ? (
        <div className="flex h-[54px] shrink-0 items-center gap-2.5 px-3">
          {Icon ? (
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-brand-muted text-brand-strong">
              <Icon className="h-[14px] w-[14px]" />
            </span>
          ) : null}
          <span className="truncate text-[14.5px] font-semibold tracking-tight text-foreground">
            {heading}
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-1">
        {groups.map((group, gi) => (
          <SubRailGroup key={group.label ?? `group-${gi}`} group={group} pathname={pathname} />
        ))}
      </div>

      {footer ? <div className="shrink-0 p-3">{footer}</div> : null}
    </aside>
  );
}

type TitleStripProps = Pick<
  ModuleShellProps,
  | 'title'
  | 'icon'
  | 'breadcrumb'
  | 'meta'
  | 'primaryAction'
  | 'secondaryActions'
  | 'onAskAI'
  | 'askAILabel'
> & { compact?: boolean };

function TitleStrip({
  title,
  icon: Icon,
  breadcrumb,
  meta,
  primaryAction,
  secondaryActions,
  onAskAI,
  askAILabel,
  compact,
}: TitleStripProps) {
  return (
    <div className={cn('flex items-center gap-3', compact ? 'h-11' : 'min-h-[44px] py-1')}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {Icon ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-[color:var(--ink-600)]">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col">
          {breadcrumb && breadcrumb.length > 0 ? (
            <nav className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 ? <ChevronRight className="size-3 opacity-50" /> : null}
                  {crumb.href ? (
                    <Link href={crumb.href} className="truncate hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          ) : null}
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[18px] font-semibold tracking-[-0.015em] text-foreground">
              {title}
            </h1>
            {meta ? (
              <>
                <span className="h-3.5 w-px bg-border" />
                <span className="truncate text-[12.5px] text-muted-foreground">{meta}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secondaryActions}
        {onAskAI ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAskAI}
            className="h-8 gap-1.5 px-2.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="size-4 text-primary" />
            {askAILabel ?? 'Ask AI'}
          </Button>
        ) : null}
        {primaryAction}
      </div>
    </div>
  );
}

type StateViewProps = Pick<
  ModuleShellProps,
  'isLoading' | 'isEmpty' | 'emptyState' | 'error' | 'children'
>;

function ModuleStateView({ isLoading, isEmpty, emptyState, error, children }: StateViewProps) {
  if (error) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {error.title ?? 'Something went wrong'}
          </p>
          {error.message ? (
            <p className="max-w-md text-[13px] text-muted-foreground">{error.message}</p>
          ) : null}
        </div>
        {error.onRetry ? (
          <Button variant="outline" size="sm" onClick={error.onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-2" aria-busy>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isEmpty && emptyState) {
    return (
      <EmptyState
        icon={emptyState.icon ?? Sparkles}
        title={emptyState.title}
        note={emptyState.description}
        cta={emptyState.action}
        className="min-h-[280px]"
      />
    );
  }

  return <>{children}</>;
}

export function ModuleShell({
  title,
  icon,
  breadcrumb,
  meta,
  railHeading,
  rail,
  editor,
  primaryAction,
  secondaryActions,
  filterBar,
  onAskAI,
  askAILabel,
  isLoading,
  isEmpty,
  emptyState,
  error,
  className,
  contentClassName,
  children,
}: ModuleShellProps) {
  const stateProps: StateViewProps = { isLoading, isEmpty, emptyState, error, children };
  const hasRail = Boolean(rail && rail.length > 0);

  return (
    <div className={cn('flex h-full min-h-0 w-full', className)}>
      {hasRail ? (
        <ModuleSubRail groups={rail!} heading={railHeading} collapsed={editor} />
      ) : null}

      <div className={cn('flex min-w-0 flex-1 flex-col', hasRail && !editor && 'gap-3 pl-4', !hasRail && 'gap-3')}>
        <div className={cn(editor && 'px-4')}>
          <TitleStrip
            title={title}
            icon={icon}
            breadcrumb={breadcrumb}
            meta={meta}
            primaryAction={primaryAction}
            secondaryActions={secondaryActions}
            onAskAI={onAskAI}
            askAILabel={askAILabel}
            compact={editor}
          />
        </div>
        {filterBar ? <div className={cn(editor && 'px-4')}>{filterBar}</div> : null}
        <div className={cn('min-h-0 min-w-0', editor ? 'flex-1' : '', contentClassName)}>
          <ModuleStateView {...stateProps} />
        </div>
      </div>
    </div>
  );
}
