'use client';

/**
 * Top-nav brand picker (B3-4.6.3).
 *
 * Mounted in the app header. Selecting a brand updates the
 * `montrai_current_brand` cookie + the React context, which every B3 surface
 * reads to scope its data fetches.
 *
 * UX decision (locked 2026-05-20): no URL prefix, no subdomain. Just a
 * dropdown that persists across navigation.
 *
 * Shared with B2 per the cross-bundle decisions table: this is the
 * single brand-picker for the whole app.
 */

import { Check, ChevronDown, ChevronsUpDown, Layers, Plus, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import { cn } from '@/lib/utils';

/** Mockup `.brand-crumb-av` — small rounded-square gradient brand mark. */
function BrandMark({ name, avatarUrl, size = 19 }: { name?: string; avatarUrl?: string; size?: number }) {
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={name || 'Brand'}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }}
      className="shrink-0 object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.58), borderRadius: Math.round(size * 0.32) }}
      className="grid shrink-0 place-items-center bg-accent-gradient font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
    >
      {name ? name.charAt(0).toUpperCase() : <Layers style={{ width: size * 0.6, height: size * 0.6 }} />}
    </span>
  );
}

export function BrandPicker({ variant = 'header', collapsed = false }: { variant?: 'header' | 'sidebar'; collapsed?: boolean }) {
  const { brands, currentBrandId, setCurrentBrandId, loading } = useCurrentBrand();
  const router = useRouter();

  // Hide entirely when the user has no brands — keeps the chrome clean for
  // single-brand workspaces / fresh signups.
  if (!loading && brands.length === 0) return null;

  const current = brands.find(b => b.id === currentBrandId) ?? null;
  const label = current ? current.name : 'All brands';
  const isSidebar = variant === 'sidebar';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isSidebar && collapsed ? (
          <button
            type="button"
            aria-label="Switch brand"
            className="mx-auto flex size-9 items-center justify-center overflow-hidden rounded-full border border-border bg-card transition-colors hover:bg-secondary"
          >
            {current?.avatarUrl ? (
              <Avatar className="size-7">
                <AvatarImage src={current.avatarUrl} alt={current.name} />
                <AvatarFallback>{current.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            ) : current ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold text-foreground">
                {current.name.charAt(0).toUpperCase()}
              </span>
            ) : (
              <Layers className="size-4 text-[color:var(--ink-500)]" />
            )}
          </button>
        ) : isSidebar ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {current?.avatarUrl ? (
              <Avatar className="h-[18px] w-[18px]">
                <AvatarImage src={current.avatarUrl} alt={current.name} />
                <AvatarFallback>{current.name.charAt(0)}</AvatarFallback>
              </Avatar>
            ) : (
              <Layers className="size-4 text-[color:var(--ink-500)]" />
            )}
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-[color:var(--ink-400)]" />
          </button>
        ) : (
          // Mockup `.brand-crumb` — 28px pill, gradient brand mark, single chevron
          <button
            type="button"
            title="Switch brand"
            className="flex h-7 items-center gap-[7px] whitespace-nowrap rounded-full border border-border bg-card pl-[7px] pr-[9px] shadow-btn transition-colors hover:border-input hover:bg-muted/60 data-[state=open]:border-input data-[state=open]:bg-muted"
          >
            <BrandMark name={current?.name} avatarUrl={current?.avatarUrl ?? undefined} />
            <span className="max-w-[150px] truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              {label}
            </span>
            <ChevronDown className="h-[13px] w-[13px] shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
          </button>
        )}
      </DropdownMenuTrigger>
      {/* Mockup `.brand-pop` — label + brand rows with gradient marks + footer actions */}
      <DropdownMenuContent
        align={isSidebar ? 'start' : 'start'}
        side={collapsed ? 'right' : 'bottom'}
        sideOffset={7}
        className="w-[290px] rounded-[10px] p-0 shadow-[var(--app-shadow-strong)]"
      >
        <div className="p-1.5">
          <DropdownMenuLabel className="px-2 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Your brands
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => setCurrentBrandId(null)}
            className={cn('gap-2.5 rounded-[9px] px-2 py-[7px]', currentBrandId === null && 'bg-brand-muted')}
          >
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border border-dashed border-input text-muted-foreground">
              <Layers className="size-4" />
            </span>
            <span className="flex-1 text-[13.5px] font-semibold">All brands</span>
            {currentBrandId === null && <Check className="size-4 text-brand-strong" />}
          </DropdownMenuItem>
          {brands.map(brand => (
            <DropdownMenuItem
              key={brand.id}
              onSelect={() => setCurrentBrandId(brand.id)}
              className={cn('gap-2.5 rounded-[9px] px-2 py-[7px]', currentBrandId === brand.id && 'bg-brand-muted')}
            >
              <BrandMark name={brand.name} avatarUrl={brand.avatarUrl ?? undefined} size={30} />
              <span className="flex-1 truncate text-[13.5px] font-semibold">{brand.name}</span>
              {currentBrandId === brand.id && <Check className="size-4 text-brand-strong" />}
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1.5">
          <DropdownMenuItem onSelect={() => router.push('/settings?tab=brands')} className="gap-2.5 px-2.5 text-[13px] font-medium text-muted-foreground">
            <Plus className="h-[15px] w-[15px]" /> Add brand
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/settings?tab=brands')} className="gap-2.5 px-2.5 text-[13px] font-medium text-muted-foreground">
            <Settings className="h-[15px] w-[15px]" /> Manage brands
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
