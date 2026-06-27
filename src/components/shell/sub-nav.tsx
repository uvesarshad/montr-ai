'use client';

/**
 * SubNav — the per-module secondary sidebar, on the grey gutter.
 *
 * Port of the mockup's `.subnav` (the v0.6 design mockup (removed) shell.jsx +
 * styles.css): 216px, borderless, bg = panel WHITE (computed truth from the
 * rendered mockup — a later rule overrides the base `--c-canvas`; rail +
 * subnav form one continuous white band and the grey gutter only frames the
 * content card), sitting OUTSIDE the floating card, with
 *   - head: module icon in a brand-tint square + title + collapse button,
 *   - body: accordion groups (mono uppercase labels, hover-reveal chevron),
 *     items with brand-tint active pills and mono counts,
 *   - foot: the "Upgrade to Enterprise" pro-card.
 * Collapses to width 0 (Topbar shows a re-expand chevron via ShellContext).
 *
 * Which module gets a SubNav is data, not layout: see `subnav-registry.ts`.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronsLeft, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button, IconButton, BetaBadge } from '@/components/ui-kit';
import type { ModuleRailGroup, ModuleRailItem } from '@/components/shell/module-shell';
import type { SubnavConfig } from './subnav-registry';
import { isBetaModule } from './beta-modules';
import { useShell } from './shell-context';
import { useSubnavBadges, type SubnavBadgeCounts } from './use-subnav-badges';

function isActivePath(pathname: string, item: ModuleRailItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/** Resolve an item's live count (badgeKey) or fall back to its static badge. */
function resolveBadge(item: ModuleRailItem, counts: SubnavBadgeCounts): React.ReactNode {
  if (item.badgeKey) {
    const count = counts[item.badgeKey];
    return count && count > 0 ? count : null; // hide 0/undefined
  }
  return item.badge ?? null;
}

function SubNavItem({
  item,
  active,
  badge,
}: {
  item: ModuleRailItem;
  active: boolean;
  badge: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex h-[33px] items-center gap-[11px] whitespace-nowrap rounded-[10px] px-3 text-[13.5px] font-medium transition-colors',
        active
          ? 'bg-brand-muted text-brand-strong'
          : 'text-muted-foreground hover:bg-card hover:text-foreground',
      )}
    >
      {Icon ? (
        <Icon className={cn('size-4 shrink-0', active ? 'opacity-100' : 'opacity-70')} />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge != null ? (
        <span
          className={cn(
            'ml-auto font-mono text-[11px] font-medium tabular-nums',
            active ? 'text-brand-strong' : 'text-muted-foreground',
          )}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Accordion group — mono uppercase label with a hover-reveal chevron. */
function SubNavGroup({
  group,
  pathname,
  counts,
}: {
  group: ModuleRailGroup;
  pathname: string;
  counts: SubnavBadgeCounts;
}) {
  const [open, setOpen] = React.useState(true);

  if (!group.label) {
    return (
      <div className="flex flex-col gap-px">
        {group.items.map((item) => (
          <SubNavItem
            key={item.href}
            item={item}
            active={isActivePath(pathname, item)}
            badge={resolveBadge(item, counts)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-px">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group/ghead flex w-full select-none items-center gap-[7px] px-3 pb-[7px] pt-3.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground/70"
      >
        <span className="flex-1">{group.label}</span>
        <ChevronDown
          className={cn(
            'size-3.5 transition-[transform,opacity]',
            open ? 'opacity-0 group-hover/ghead:opacity-70' : '-rotate-90 opacity-70',
          )}
        />
      </button>
      {open
        ? group.items.map((item) => (
            <SubNavItem
              key={item.href}
              item={item}
              active={isActivePath(pathname, item)}
              badge={resolveBadge(item, counts)}
            />
          ))
        : null}
    </div>
  );
}

/** The mockup's `.pro-card` SubNav footer. */
function ProCard() {
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-gradient-to-br from-card to-secondary p-[15px] shadow-card">
      <span
        aria-hidden
        className="absolute -right-7 -top-7 h-[86px] w-[86px] rounded-full bg-brand opacity-[0.16] blur-[10px]"
      />
      <div className="relative text-[14px] font-semibold tracking-[-0.01em] text-foreground">
        Upgrade to Enterprise
      </div>
      <p className="relative mb-3 mt-1 text-[11.5px] leading-[1.45] text-muted-foreground">
        Unlimited credits, SSO &amp; priority support.
      </p>
      <Link href="/settings?tab=billing" className="relative block">
        <Button variant="primary" size="sm" icon={Zap} className="w-full" tabIndex={-1}>
          Upgrade plan
        </Button>
      </Link>
    </div>
  );
}

export function SubNav({ config }: { config: SubnavConfig }) {
  const pathname = usePathname();
  const { subnavOpen, setSubnavOpen } = useShell();
  const counts = useSubnavBadges();
  const Icon = config.icon;

  return (
    <aside
      className={cn(
        // Inset surface (Layered Neutral Surface System): the gutter sits one rung
        // below white content cards. Ladder: dark rail → inset gutter → white cards.
        'hidden shrink-0 flex-col overflow-hidden bg-secondary transition-[width,opacity] duration-200 ease-out md:flex',
        subnavOpen ? 'w-[216px] border-r border-border opacity-100' : 'w-0 opacity-0',
      )}
      aria-hidden={!subnavOpen}
    >
      {/* Head */}
      <div className="flex h-[54px] shrink-0 items-center gap-[9px] pl-4 pr-2">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-brand-muted text-brand-strong">
          <Icon className="size-3.5" />
        </span>
        <span className="whitespace-nowrap text-[14.5px] font-semibold tracking-[-0.02em] text-foreground">
          {config.title}
        </span>
        {isBetaModule(config.match) ? <BetaBadge size="sm" /> : null}
        <IconButton
          icon={ChevronsLeft}
          iconSize={16}
          onClick={() => setSubnavOpen(false)}
          aria-label="Hide panel"
          title="Hide panel"
          className="ml-auto h-[26px] w-[26px]"
          tabIndex={subnavOpen ? 0 : -1}
        />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {config.groups.map((group, gi) => (
          <SubNavGroup
            key={group.label ?? `group-${gi}`}
            group={group}
            pathname={pathname}
            counts={counts}
          />
        ))}
      </div>

      {/* Foot */}
      <div className="shrink-0 p-3">
        <ProCard />
      </div>
    </aside>
  );
}
