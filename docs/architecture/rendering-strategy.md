# Rendering Strategy

> Scope: Documents which routes use which rendering strategy and why.
> Rendering context: Mixed — see per-route breakdown below.
> Project tier: 4
> Last updated: 2026-06-04

## Overview

MontrAI uses Next.js 15 App Router. The majority of application pages are Client Components because they require live session state (useSession), real-time socket updates, and interactive UI. Public pages (marketing, login, public docs) are statically renderable. There is no ISR or Edge Runtime in use. Server Components are used only in simple wrapper pages that delegate to a client shell.

AGENT AVOID: The app uses a custom Node server (server.js). Edge Runtime features (edge middleware aside) are not used. Do not add runtime: 'edge' to route handlers.

## Layout-Level Rendering

- src/app/layout.tsx — Server Component. Wraps the tree with providers that have no server-side data dependencies.
- src/app/(app)/layout.tsx — Client Component (uses client directive). Reads session via useSession, redirects unauthenticated users, mounts the Rail, per-module SubNav, and AppHeader.

AGENT NOTE: Because src/app/(app)/layout.tsx is a Client Component, all pages inside (app)/ render client-side by default unless explicitly converted. Adding a Server Component page inside (app)/ works, but data fetching must not rely on cookies/session without using the server-side auth() function.

## Route-by-Route Strategy

### Public Routes (Static / Server)
These pages have no session dependency and can be fully server-rendered.
- src/app/page.tsx — Home/marketing landing. Server Component.
- src/app/login/page.tsx — Login page. Server Component shell; form is client.
- src/app/signup/page.tsx — Signup page. Server Component shell; form is client.
- src/app/p/[...slug]/ — Public document viewer. Server Component; fetches doc data server-side.
- src/app/forgot-password/, src/app/reset-password/, src/app/verify-email/ — Server shells, client forms.

### Protected App Routes (Client-Side Rendering)
All routes under src/app/(app)/ inherit the client layout. Pages are Client Components unless noted.
- src/app/(app)/dashboard/page.tsx — Client Component. Fetches stats via TanStack Query.
- src/app/(app)/canvas/page.tsx — Client Component. Lists canvases.
- src/app/(app)/canvas/[id]/page.tsx — Client Component. Full ReactFlow editor; requires socket connection for real-time execution updates.
- src/app/(app)/crm/ — All CRM pages are Client Components. Data grid, kanban, and detail views use local state and TanStack Query.
- src/app/(app)/agent/page.tsx — Server Component wrapper; renders AgentShell client component.
- src/app/(app)/social/ — Client Components. Calendar, drafts, and publish flows.
- src/app/(app)/inbox/ — Client Components. Real-time inbox with socket connection. page.tsx is a Client Component.
- src/app/(app)/campaigns/ — Email campaigns and WhatsApp campaigns. page.tsx is a Server Component (async; loads data server-side via getMarketingWorkspaceData and redirects to /login if absent) rendering the MarketingEmailOverview client component beneath.
- src/app/(app)/settings/page.tsx — Client Component. User/org settings.
- src/app/(app)/design/[id]/page.tsx — Client Component. Fabric.js canvas.
- src/app/(app)/forms/[id]/page.tsx — Client Component. Form builder.
- src/app/(app)/docs/[id]/page.tsx — Client Component. TipTap editor.
- src/app/(app)/ai-studio/ — Client Components.
- src/app/(app)/ai-bots/ — Client Components.

### Admin Routes
- src/app/(admin)/ — Client Components. Session role check inside layout.

### API Routes (Server)
All route handlers under src/app/api/v2/ run server-side. They use auth() from @/auth to read the JWT session. No client-side rendering applies.

AGENT NOTE: API routes in src/app/api/v2/ must always call auth() and verify the session before any DB operation.

## Caching Strategy

No explicit fetch cache or revalidate configuration is used in API routes — they are all dynamic. Client-side caching is managed by TanStack Query per-hook staleTime settings. The BullMQ worker does not participate in Next.js caching.

## Streaming

The canvas execution endpoint src/app/api/v2/canvases/[id]/execute/route.ts returns a JSON response, not a stream. POST converts the canvas graph to a UnifiedWorkflow and enqueues a BullMQ execution; by default it blocks on waitForJob and returns the final JSON result, or returns immediately with a jobId when called with wait=false (callers then poll GET for status). Real-time node progress reaches the client over the Socket.io connection, not via SSE on this route.

AGENT NOTE: Do not call this route expecting an SSE/event-stream body — it is request/response JSON. Live execution progress comes through the socket connection.

## Update Triggers

Update this file when a route changes its rendering strategy, when a new route is added under (app)/, or when a new streaming or edge route is introduced.

## Related Docs

- docs/ui/layout-system.md — Layout hierarchy
- docs/modules/canvas.md — Canvas-specific SSE and socket behavior
- docs/state/client-state.md — TanStack Query cache configuration
