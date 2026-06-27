
'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Search,
  PanelLeft,
  LayoutGrid,
  File,
  Settings as SettingsIcon,
  CalendarDays,
  Shield,
  Pencil,
  BookText,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { useToast } from '@/hooks/use-toast';
import { CreditMeter } from './credit-meter';
import { NotificationBell } from './notifications/notification-bell';
import { getAppHeaderClassNames } from './app-header-styles';
import { useGlobalSearch } from './search/global-search-provider';
import { BrandPicker } from './brand-picker';
import { ThemeToggle } from './theme-toggle';
import { Button as KitButton, IconButton } from '@/components/ui-kit';
import { useShell } from '@/components/shell/shell-context';
import { resolveSubnav, activeSectionLabel } from '@/components/shell/subnav-registry';
import { openAgentLauncher } from '@/lib/agent/launcher';

const navLinks = [
  { href: '/dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { href: '/canvas', icon: File, label: 'Canvases' },
  { href: '/docs', icon: BookText, label: 'Docs' },
  { href: '/social/calendar', icon: CalendarDays, label: 'Social Calendar' },
  { href: '/settings', icon: SettingsIcon, label: 'Settings' },
  { href: '/admin', icon: Shield, label: 'Admin' },
];

type HeaderInfo = { type: 'canvas' | 'doc' | 'page', name?: string, title?: string | React.ReactNode, description?: React.ReactNode, lastSaved?: string, actions?: React.ReactNode, backHref?: string } | null;

const AppHeaderContext = createContext<{
  headerInfo: HeaderInfo;
  setHeaderInfo: React.Dispatch<React.SetStateAction<HeaderInfo>>;
}>({
  headerInfo: null,
  setHeaderInfo: () => { },
});

export const useAppHeader = () => useContext(AppHeaderContext);

export const AppHeaderProvider = ({ children }: { children: React.ReactNode }) => {
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo>(null);
  return (
    <AppHeaderContext.Provider value={{ headerInfo, setHeaderInfo }}>
      {children}
    </AppHeaderContext.Provider>
  );
};

// ... (provider above)

const EditableCanvasName = ({ canvasId, initialName }: { canvasId: string, initialName: string }) => {
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setIsEditing(false);
      setName(initialName);
      return;
    }

    try {
      // Use MongoDB API to update canvas name
      await fetch(`/api/v2/canvases/${canvasId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      toast({ title: 'Canvas Renamed', description: `The canvas is now named "${name.trim()}".` });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to rename canvas' });
      setName(initialName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setName(initialName);
    }
  };

  if (isEditing) {
    return (
      <Input
        value={name}
        onChange={handleNameChange}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 w-auto min-w-[200px] max-w-sm text-lg font-semibold"
        autoFocus
      />
    );
  }

  return (
    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditing(true)}>
      <h1 className="text-lg font-semibold truncate max-w-sm">{name}</h1>
      <Pencil className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};

export function AppHeader({ isCollapsed }: { isCollapsed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { headerInfo, setHeaderInfo } = useAppHeader();
  const { setOpen: setSearchOpen } = useGlobalSearch();

  const isCanvasPage = !!(pathname.startsWith('/canvas/') && params.id);
  const canvasId = isCanvasPage ? params.id as string : null;

  // Reset header info on route change so a page that doesn't set it starts clean.
  useEffect(() => {
    setHeaderInfo(null);
  }, [pathname, setHeaderInfo]);

  const headerClassNames = getAppHeaderClassNames({ isCanvasPage, isCollapsed });
  const showChrome = !pathname.startsWith('/canvas') && !pathname.startsWith('/forms');

  // Module chrome (mockup Topbar): breadcrumbs, quick actions and the Create
  // CTA all derive from the shell's subnav registry.
  const subnavConfig = showChrome ? resolveSubnav(pathname) : null;
  const hasSubnavPanel = Boolean(subnavConfig && subnavConfig.groups.length > 0);
  const { subnavOpen, setSubnavOpen } = useShell();
  // Pages that set a headerInfo title own the breadcrumb tail; otherwise it
  // derives from the active subnav section.
  const sectionLabel =
    subnavConfig && !headerInfo?.title ? activeSectionLabel(subnavConfig, pathname) : null;

  return (
    <header className={headerClassNames.header}>
      {/* Re-expand the SubNav when it's collapsed (mockup: chevron at far left) */}
      {hasSubnavPanel && !subnavOpen ? (
        <IconButton
          icon={ChevronRight}
          iconSize={18}
          onClick={() => setSubnavOpen(true)}
          aria-label="Show panel"
          title="Show panel"
          className="-ml-1 hidden shrink-0 sm:grid"
        />
      ) : null}

      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden">
            <PanelLeft className="size-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs">
          <nav className="grid gap-6 text-lg font-medium">
            <Logo showText={true} />
            {navLinks.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground',
                  pathname.startsWith(href) && 'text-foreground'
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Brand crumb — the workspace/brand switcher, leftmost (not on the canvas editor) */}
      {!isCanvasPage && (
        <div className="hidden shrink-0 items-center sm:flex">
          <BrandPicker variant="header" />
        </div>
      )}

      {/* Module breadcrumb (mockup: brand → module → section) */}
      {subnavConfig && hasSubnavPanel ? (
        <nav className="hidden min-w-0 items-center gap-1.5 sm:flex" aria-label="Breadcrumb">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <Link
            href={subnavConfig.match}
            className="rounded-md px-1.5 py-0.5 text-[13.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {subnavConfig.title}
          </Link>
          {sectionLabel ? (
            <>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate px-1.5 py-0.5 text-[13.5px] font-semibold text-foreground">
                {sectionLabel}
              </span>
            </>
          ) : null}
        </nav>
      ) : null}

      {/* Canvas name (editor) */}
      {headerInfo?.type === 'canvas' && canvasId && headerInfo.name && (
        <EditableCanvasName canvasId={canvasId} initialName={headerInfo.name} />
      )}

      {/* Page title / breadcrumb */}
      {headerInfo?.type === 'page' && (
        <div className={cn('flex min-w-0 items-center', headerClassNames.titleGroup)}>
          {headerInfo.backHref ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-xl"
              onClick={() => router.push(headerInfo.backHref!)}
            >
              <ChevronLeft className="size-5" />
            </Button>
          ) : (
            <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
          )}
          {typeof headerInfo.title === 'string' ? (
            <div className="flex min-w-0 items-center gap-2">
              <h1 className={cn(
                "truncate text-[13.5px] font-semibold leading-none tracking-tight",
                pathname === '/canvas' && "text-[1rem] font-normal"
              )}>
                {headerInfo.title}
              </h1>
              {headerInfo.description ? (
                <>
                  <div className="h-3.5 w-px bg-border/70" />
                  <div className="truncate text-[12.5px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
                    {headerInfo.description}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0">{headerInfo.title}</div>
          )}
        </div>
      )}

      {/* Right cluster (mockup rhythm: actions · | · search + credits · | · bell/theme/help · | · Create) */}
      <div className="relative ml-auto flex items-center justify-end gap-1 md:grow-0">
        {headerInfo?.actions ? (
          <div className={headerClassNames.actionsGroup}>{headerInfo.actions}</div>
        ) : null}
        {subnavConfig?.headerActions?.map((action) => (
          <IconButton
            key={action.label}
            icon={action.icon}
            iconSize={17}
            onClick={() => {
              if (action.run === 'ask-agent') {
                openAgentLauncher({
                  prompt: 'Help me with what I am looking at right now.',
                  context: { source: 'topbar_ask_ai', route: pathname },
                });
              } else if (action.href) {
                router.push(action.href);
              }
            }}
            aria-label={action.label}
            title={action.label}
            className="hidden sm:grid"
          />
        ))}
        {headerInfo?.actions || subnavConfig?.headerActions?.length ? (
          <span className="mx-1 h-5 w-px bg-border" />
        ) : null}

        {showChrome && <HeaderSearchTrigger />}
        {showChrome && <CreditMeter variant="header" />}

        <span className="mx-1 h-5 w-px bg-border" />

        <NotificationBell />
        <ThemeToggle className="size-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" />
        <IconButton icon={HelpCircle} iconSize={16} aria-label="Help & resources" title="Help & resources" className="hidden sm:grid" />

        {/* Per-module Create CTA (mockup CREATE_LABEL — near-black pill) */}
        {subnavConfig?.create ? (
          <>
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <KitButton
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                const href = subnavConfig.create?.href;
                // No direct create target → the command palette (mockup behaviour).
                if (href) router.push(href);
                else setSearchOpen(true);
              }}
              className="hidden shrink-0 sm:inline-flex"
            >
              {subnavConfig.create.label}
            </KitButton>
          </>
        ) : null}
      </div>
    </header>
  );
}

function HeaderSearchTrigger() {
  const { setOpen } = useGlobalSearch();
  return (
    <IconButton
      icon={Search}
      iconSize={16}
      onClick={() => setOpen(true)}
      aria-label="Search"
      title="Search (⌘K)"
    />
  );
}
