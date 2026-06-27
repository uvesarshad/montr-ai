
'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Rail } from '@/components/shell/rail';
import { SubNav } from '@/components/shell/sub-nav';
import { ShellProvider } from '@/components/shell/shell-context';
import { resolveSubnav } from '@/components/shell/subnav-registry';
import { AppHeader, AppHeaderProvider } from '@/components/app-header';
import { Loader2 } from 'lucide-react';

import { TourGuide } from '@/components/tour-guide';
import { SidebarProvider } from '@/components/sidebar-provider';
import { AgentLauncher } from '@/components/agent/agent-launcher';
import { GlobalSearchProvider } from '@/components/search/global-search-provider';
import { CurrentBrandProvider } from '@/hooks/use-current-brand';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Handle redirect inside an effect to avoid setting state during render
  React.useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [session, status, router]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated (loading handled in effect, UI fallback shown here)
  if (!session) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <CurrentBrandProvider>
      <AppHeaderProvider>
        <TourGuide />
        <SidebarProvider>
          <GlobalSearchProvider>
            <ShellProvider>
              <AppLayoutContent>{children}</AppLayoutContent>
            </ShellProvider>
          </GlobalSearchProvider>
        </SidebarProvider>
      </AppHeaderProvider>
    </CurrentBrandProvider>
  );
}

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isEditorPage = (pathname.startsWith('/canvas/') && pathname !== '/canvas' && pathname !== '/canvas/templates');
  const subnav = isEditorPage ? null : resolveSubnav(pathname);

  return (
    <div className="app-shell-bg flex h-screen w-full flex-col overflow-hidden">
      {/*
        Skip-to-content link for keyboard users. Visually hidden until
        focused, then anchored at the top-left. Lets screen-reader and
        keyboard-only users bypass the sidebar nav on every page load.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-primary"
      >
        Skip to main content
      </a>
      <Rail />

      {isEditorPage ? (
        // Editors (Canvas / Design) run full-bleed — no floating card.
        <div className="relative flex h-full min-h-0 flex-col sm:pl-[60px]">
          <AppHeader isCollapsed={false} />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-auto focus:outline-none"
          >
            {children}
          </main>
        </div>
      ) : (
        // Flat workspace: rail · per-module SubNav · content sit on one
        // continuous white surface (no floating card / grey gutter). The
        // SubNav carries a hairline border to separate it from the content.
        <div className="flex h-full min-h-0 bg-card sm:pl-[60px]">
          {subnav && subnav.groups.length > 0 ? <SubNav config={subnav} /> : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <AppHeader isCollapsed={false} />
            <main
              id="main-content"
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-auto focus:outline-none"
            >
              {children}
            </main>
          </div>
        </div>
      )}

      <AgentLauncher />
    </div>
  );
}
