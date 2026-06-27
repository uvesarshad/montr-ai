# Client State

> Scope: All client-side state patterns — context, hooks, and TanStack Query.
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-04

## Overview

MontrAI uses three client-side state layers: React Context for UI-level shared state (sidebar, header, session), TanStack Query for server state (async data fetching with caching), and local useState/useReducer within components for ephemeral UI state. There is no Redux or Zustand. Socket.io events from server are handled by dedicated hooks (use-socket.ts, use-inbox-socket.ts) and drive local state updates.

## Context Providers

All context providers are mounted in src/app/layout.tsx or src/app/(app)/layout.tsx.

QueryProvider — src/components/providers/query-provider.tsx. Wraps the entire tree with TanStack Query's QueryClientProvider. Client-side. All components using useQuery or useMutation must be descendants.

NextAuthProvider — src/components/providers/next-auth-provider.tsx. Wraps the tree with SessionProvider from next-auth/react. Enables useSession across all client components.

ThemeProvider — src/components/theme-provider.tsx. Provides dark/light/system theme via next-themes. Reads and writes class on the html element.

I18nProvider — src/i18n/i18n-context.tsx. Provides internalization context.

AppHeaderProvider — src/components/app-header.tsx. Provides useAppHeader hook. Allows page components to set breadcrumbs, title, and action buttons in the shared header without prop drilling.

SidebarProvider — src/components/sidebar-provider.tsx. Provides useSidebar hook for toggling the sidebar open/closed state.

GlobalSearchProvider — src/components/search/global-search-provider.tsx. Provides global search state and command palette.

ExecutionContext — src/contexts/execution-context.tsx. Provides workflow execution state (running nodes, step results) to canvas UI components.

CurrentBrandProvider — src/hooks/use-current-brand.tsx. Provides useCurrentBrand hook. Owns currentBrandId (null = "all brands" cross-brand view) and the brands list for every brand-scoped surface. On mount it reads the selection from a non-HttpOnly cookie (montrai_current_brand) and fetches the brand list from /api/v2/brands; setCurrentBrandId writes the cookie back so server components can read it during SSR. Brand selection is mandatory platform-wide — a default brand is always selected.

ShellProvider — src/components/shell/shell-context.tsx. Provides useShell hook. Owns the SubNav open/collapsed flag (subnavOpen). Re-opens the SubNav automatically when the user navigates to a different module.

TourGuide — src/components/tour-guide.tsx. Not a context provider but a mounted global in src/app/(app)/layout.tsx. Owns no shared state; reads the session status and a hasSeenTour localStorage flag to run the driver.js onboarding tour once for authenticated users.

AGENT NOTE: Do not add new global context providers without a clear reason. Prefer TanStack Query for server data and local state for UI interactions.

## TanStack Query — Key Hooks

TanStack Query (formerly React Query) is the primary mechanism for fetching and caching server state. All data-fetching hooks follow the pattern: useQuery for reads, useMutation for writes.

### Platform Hooks

use-profile.ts — fetches /api/v2/users/me. Provides user profile and plan. Used widely across the app for permission checks client-side.

use-canvases-v2.ts — fetches /api/v2/canvases. Provides canvas list with pagination.

use-workflows.ts — fetches /api/v2/workflow-templates or similar. Provides workflow data.

use-docs-v2.ts — fetches document list.

use-forms.ts — fetches forms list.

use-designs.ts — fetches designs list.

use-credits.ts — fetches credit usage for the current user.

use-dashboard-stats.ts — fetches dashboard summary statistics.

use-admin.ts — admin-only data hook.

use-analytics.ts — analytics data.

use-chat.ts — AI Studio chat state.

use-conversations.ts — inbox conversations.

use-submissions.ts — form submission data.

use-templates.ts — canvas/workflow templates.

### CRM Hooks (src/hooks/crm/)

use-contacts.ts, use-contact.ts — contact list and single contact.
use-companies.ts, use-company.ts — company data.
use-deals.ts, use-deal.ts — deal data and kanban state.
use-pipelines.ts — pipeline and stage data.
use-activities.ts — activity timeline.
use-tags.ts — tag list.
use-views.ts — saved CRM views.
use-favorites.ts — user favorites.
use-comments.ts — comment threads.
use-attachments.ts — file attachments.
use-crm-search.ts — cross-entity search.
use-crm-stats.ts — CRM dashboard stats.
use-crm-keyboard.ts — keyboard shortcuts (/, n, Alt+c/o/d/a).

### Agent Hooks (src/hooks/agent/)

Hooks for mission list, mission detail, pending HITL actions, and event streaming.

## Socket.io Hooks

use-socket.ts — connects to Socket.io at /api/socket. Joins workflow rooms (workflow:<id>) and execution rooms. Re-emits received events into the ExecutionContext.

use-inbox-socket.ts — Socket.io subscription for real-time inbox messages.

## Local State Patterns

Canvas node state — managed locally in the ReactFlow onNodesChange/onEdgesChange callbacks within the canvas editor component.

Form state — React Hook Form (useForm) with Zod resolver. Used in all CRM forms, settings forms, and publish forms.

Modal/sheet state — local useState booleans controlling Dialog and Sheet visibility.

AGENT UPDATE: Update this file when a new hook or context provider is added, when the caching strategy of a key hook changes, or when a new Socket.io event is introduced.

## Related Docs

- docs/state/server-state.md — BullMQ and server-side caching
- docs/architecture/rendering-strategy.md — Which pages are client-rendered
- docs/modules/canvas.md — ExecutionContext and socket-driven state
