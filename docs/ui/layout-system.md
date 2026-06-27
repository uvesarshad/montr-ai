# Layout System

> Scope: Layout hierarchy from root to page, slot patterns, and header state.
> Rendering context: Mixed — root layout is Server, app layout is Client
> Project tier: 4
> Last updated: 2026-06-04

## Overview

MontrAI has a two-level layout hierarchy. The root layout provides global providers. The app layout provides the authenticated shell (Rail, per-module SubNav, Topbar/AppHeader, agent launcher). Individual pages render inside the shell's content area. There are no parallel routes or slot patterns in use.

## Level 1 — Root Layout

File: src/app/layout.tsx. Framework special file. Server Component.

Mounts in order: QueryProvider → NextAuthProvider → ThemeProvider → I18nProvider → children → Toaster.

Also loads: PWA manifest metadata, register-sw.js script (afterInteractive), robots: no-index/no-follow.

AGENT NOTE: Providers added here must not contain client-only hooks or session logic. This layout runs server-side. If a provider needs useSession, it belongs in the app layout.

## Level 2 — App Layout (Authenticated Shell)

File: src/app/(app)/layout.tsx. Framework special file. Client Component.

Checks session via useSession. Shows a loading spinner during status === 'loading'. Redirects to /login if unauthenticated.

When authenticated, renders this provider/component nesting:
- CurrentBrandProvider (active brand context)
  - AppHeaderProvider (wraps children with header context)
    - TourGuide (product tour overlay)
    - SidebarProvider
      - GlobalSearchProvider
        - ShellProvider (shell chrome state — see below)
          - AppLayoutContent (internal component)

AppLayoutContent owns the actual shell mount. It always renders the Rail, the AgentLauncher (floating bottom-right, present on every authenticated page), and a main content region. It resolves the current pathname against the SubNav registry (resolveSubnav from src/components/shell/subnav-registry.ts) and branches on rendering context:
- Editor pages (canvas editors under /canvas/, and /design/) render full-bleed: AppHeader + main, no gutter SubNav.
- All other pages render the flat workspace: Rail · per-module SubNav (only when the resolved config has groups) · a column with AppHeader + main.

The layout reserves a constant 60px left inset for the Rail (sm:pl-[60px]); the Rail's expanded state is an overlay that does not reflow content.

## AppHeader and AppHeaderProvider (Topbar)

AppHeader (src/components/app-header.tsx) is the Topbar rendered inside the shell. It shows the brand crumb, breadcrumbs (derived from the active SubNav registry entry), a quick-action / Create cluster, and right-side chrome. It reads state from AppHeaderProvider context.

useAppHeader hook — consumed by page components to set the header title, breadcrumbs, and action slot content. This avoids passing props up through the layout tree.

Pattern: a page component calls useAppHeader at mount and provides its title and actions. The header reads these and renders them.

## Rail

File: src/components/shell/rail.tsx. Client Component.

The primary module switcher: a 60px icon strip that hover-expands to a 248px floating overlay (pure-CSS hover, so it does not depend on SidebarProvider for its expand state). Holds the module links and the user account cluster at the bottom. Sections live in the per-module SubNav, not here.

## SubNav and the SubNav registry

The per-module gutter navigation is the central SubNav (src/components/shell/sub-nav.tsx), mounted once by AppLayoutContent — never inside module layouts. Each module's sections, title, icon, Create CTA, and Topbar quick actions are registered as entries in src/components/shell/subnav-registry.ts (SUBNAV_REGISTRY). resolveSubnav does longest-prefix matching on the pathname; activeSectionLabel derives the breadcrumb tail. Modules without an entry (or with an empty groups list) render with no gutter panel.

## ShellProvider

File: src/components/shell/shell-context.tsx. Client Component.

Owns the shell chrome state shared across Rail/SubNav/Topbar. Currently a single piece of state: the SubNav open/closed flag (subnavOpen / setSubnavOpen), consumed via the useShell hook. It reads the pathname and automatically re-opens the SubNav whenever the user switches to a different top-level module.

AGENT SEE: docs/ui/component-library.md (ui-kit and Rail entries) for the components composed into this shell.

## AgentLauncher

File: src/components/agent/agent-launcher.tsx. Client Component. Present on all authenticated pages. Floating button that opens the agent mission creation dialog.

## Admin Layout

File: src/app/(admin)/layout.tsx. Client Component. Renders a simpler shell for admin pages with a separate admin sidebar. Inherits root layout providers.

## Public Pages

Pages outside (app)/ and (admin)/ (e.g., /login, /signup, /p/[...slug]) use the root layout only. No sidebar or header is rendered.

## Module-level Layouts

Module navigation is NOT mounted in module layouts — it is registered centrally in src/components/shell/subnav-registry.ts and rendered by AppLayoutContent. Module layout.tsx files are therefore thin: they exist only to wrap children in a module-specific provider, and pass children straight through otherwise.
- src/app/(app)/campaigns/layout.tsx — Email marketing module (route is /campaigns for historical reasons). Pass-through; its SubNav comes from the registry's EMAIL_RAIL entry.
- src/app/(app)/whatsapp/layout.tsx — Wraps children in WhatsAppAccountProvider; its SubNav comes from the registry's WHATSAPP_RAIL entry.
- src/app/(app)/social/layout.tsx — Social module layout; its SubNav comes from the registry's SOCIAL_RAIL entry.
- src/app/(app)/crm/ — CRM navigation is the central SubNav driven by the registry's CRM_RAIL entry; there is no per-module CRM sidebar component.

AGENT UPDATE: Update this file when a layout is added, removed, or restructured, or when the header or sidebar components change significantly.

## Related Docs

- docs/architecture/rendering-strategy.md — Rendering context of each layout
- docs/ui/theming.md — CSS variables used in layout components
- docs/modules/canvas.md — Canvas-specific layout (full-screen editor without header)
