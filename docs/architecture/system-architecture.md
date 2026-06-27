# System Architecture — High-Level Map

> Scope: One-page visual map of how the frontend, backend, admin panel, super-admin panel, background processes, and data stores connect.
> Rendering context: Mermaid diagrams — render natively in Obsidian, GitHub, and VS Code.
> Last updated: 2026-06-05

## TL;DR

MontrAI is **not** a separate-frontend/separate-backend system. It is a single Next.js 15 monolith served by a custom Node server (`server.js`), where:

- The **frontend** is the App Router page tree (`src/app/`), composed from the ui-kit.
- The **backend** is the API route handlers (`src/app/api/v2/**`) + Server Components + Socket.io, living in the *same process and same repo*.
- Frontend and backend are connected by **three concrete transport paths** (fetch via TanStack Query, direct DB access in Server Components, Socket.io websocket) — evidence below.
- Two extra OS processes exist: the **BullMQ worker** and the **voice websocket server**, glued to the web process via Redis.

---

## 1. Big Picture — processes, stores, externals

```mermaid
flowchart TB
    subgraph Browser["🖥️ Browser (one React app, three faces)"]
        AppUI["App UI — (app) shell<br/>dashboard, inbox, CRM, canvas,<br/>campaigns, social, agent, ads…"]
        OrgAdmin["Platform admin pages — (app)/admin<br/>templates, AI/voice providers,<br/>broadcast notifications"]
        SuperAdmin["Admin portal — (admin) group<br/>users, orgs, plans, models,<br/>scraping, audit logs"]
    end

    subgraph WebProc["⚙️ Process 1 — node server.js (dev :3000 / here :9002, prod :9002 via PM2)"]
        NextJS["Next.js 15 App Router<br/>SSR pages + Server Components"]
        API["API route handlers<br/>/api/v2/** (+ legacy /api/*)"]
        SocketIO["Socket.io @ /api/socket<br/>global.io rooms: user:&lt;id&gt;, workflow:&lt;id&gt;"]
        MW["middleware.ts<br/>auth gate + CSRF same-origin"]
    end

    subgraph WorkerProc["⚙️ Process 2 — npm run worker<br/>scripts/workflow-worker.ts"]
        Engine["UnifiedWorkflowExecutionEngine<br/>+ NodeProcessorRegistry"]
        Crons["BullMQ crons: digest (daily),<br/>token refresh (10m), notion sync (15m),<br/>metrics sync (6h), ads summary (weekly)"]
    end

    VoiceWS["⚙️ Process 3 — npm run voice-ws<br/>server/voice-ws.js :3001<br/>Twilio media streams, STT/TTS"]

    subgraph Stores["🗄️ Data stores"]
        Mongo[("MongoDB / Mongoose<br/>~100 models, all tenant data<br/>scoped by organizationId")]
        PG[("PostgreSQL + pgvector<br/>knowledge embeddings,<br/>semantic search")]
        Redis[("Redis<br/>BullMQ queues · pub/sub bus ·<br/>rate limits · socket bridge")]
    end

    subgraph External["☁️ External services"]
        AI["AI providers via src/ai/client.ts<br/>(Genkit ⊕ Vercel AI SDK, routeHint)"]
        Social["19 social platforms<br/>src/lib/social/oauth/ engine"]
        Integ["12+ business tools<br/>src/lib/integrations/registry.ts"]
        Ads["Google Ads / Meta Ads<br/>create-only, PAUSED writes"]
        Pay["Razorpay"]
        Sentry["Sentry"]
    end

    AppUI -- "fetch /api/v2/** (TanStack Query)" --> API
    OrgAdmin -- "fetch /api/v2/admin/**" --> API
    SuperAdmin -- "fetch /api/v2/admin/**" --> API
    AppUI -- "websocket /api/socket" --> SocketIO
    Browser -- "page request (SSR)" --> NextJS
    MW -.->|"guards every request"| NextJS
    MW -.-> API

    NextJS --> Mongo
    API --> Mongo
    API --> PG
    API --> Redis
    API -- "enqueue long runs" --> Redis
    Redis -- "BullMQ jobs" --> Engine
    Engine --> Mongo
    Engine -- "events via pub/sub" --> Redis
    Redis -- "bus.ts → global.io emit" --> SocketIO
    VoiceWS --> Mongo
    VoiceWS -- "voice events" --> Redis

    API --> AI
    Engine --> AI
    API --> Social
    Engine --> Integ
    API --> Ads
    API --> Pay
    WebProc -.-> Sentry
    WorkerProc -.-> Sentry
```

**Key takeaway:** there is no network boundary between "frontend" and "backend" deployments — they are one Next.js app. The real process boundaries are **web ⇄ worker ⇄ voice-ws**, and Redis is the glue between them.

---

## 2. Is the frontend *really* connected to the backend? — Yes, three ways

Concrete, verified wiring (hook file → HTTP endpoint → route handler file):

| # | Path | Frontend side | Transport | Backend side |
|---|------|--------------|-----------|--------------|
| 1 | **Client fetch** | `src/hooks/crm/use-activities.ts` (TanStack Query) | `fetch('/api/v2/crm/activities')` | `src/app/api/v2/crm/activities/route.ts` |
| 1 | | `src/hooks/use-admin.ts` → `useAdminStats` / `useAdminUsers` / `useAdminPlans` | `fetch('/api/v2/admin/stats' \| '/users' \| '/plans')` | `src/app/api/v2/admin/*/route.ts` |
| 2 | **Server Components** | `src/app/(app)/admin/layout.tsx` | none — same process | `requireSuperAdmin()` in `src/middleware/auth.ts` queries Mongoose directly |
| 3 | **Realtime** | `src/hooks/use-socket.ts` → `io({ path: '/api/socket' })` | websocket | `server.js` Socket.io server; events pushed via `global.io` and Redis bus (`src/lib/workflow/events/bus.ts`) |

```mermaid
sequenceDiagram
    participant B as Browser (React page)
    participant Q as TanStack Query hook
    participant M as middleware.ts
    participant R as /api/v2 route handler
    participant DB as MongoDB (repository layer)
    participant W as BullMQ worker
    participant S as Socket.io (/api/socket)

    Note over B,DB: Path 1 — client fetch (most UI data)
    B->>Q: useActivities()
    Q->>M: GET /api/v2/crm/activities
    M->>M: auth() session + CSRF check
    M->>R: pass
    R->>DB: repository.find({ organizationId })
    DB-->>B: JSON → Query cache → render

    Note over B,DB: Path 2 — Server Component (SSR)
    B->>M: GET /campaigns (page request)
    M->>DB: page reads repositories directly, no fetch
    DB-->>B: rendered HTML

    Note over B,S: Path 3 — realtime push
    B->>S: io.connect, join workflow:<id>
    B->>R: POST /api/v2/canvases/[id]/execute
    R->>W: enqueue BullMQ job (Redis)
    W->>W: run nodes (engine)
    W--)S: execution events via Redis pub/sub
    S--)B: execution:started / node:completed …
```

---

## 3. Admin vs Super-Admin — two surfaces, one URL namespace

Both live under `/admin/*` but on **disjoint sub-paths**, wrapped by different shells, with different gates:

```mermaid
flowchart LR
    subgraph Roles["Role hierarchy (session.user.role)"]
        U["user"] --> A["admin<br/>(org-scoped)"] --> SA["super_admin<br/>(platform-wide)"]
    end

    subgraph PortalGroup["src/app/(admin)/ — standalone Admin Portal"]
        direction TB
        PLayout["layout.tsx — client gate:<br/>role ∈ {admin, super_admin}<br/>AdminSidebar + AdminHeader (own shell)"]
        P1["/admin — dashboard"]
        P2["/admin/users"]
        P3["/admin/organizations 🔒SA"]
        P4["/admin/plans 🔒SA"]
        P5["/admin/models 🔒SA"]
        P6["/admin/scraping 🔒SA"]
        P7["/admin/audit-logs 🔒SA"]
        PLayout --> P1 & P2 & P3 & P4 & P5 & P6 & P7
    end

    subgraph AppGroup["src/app/(app)/admin/ — inside main app shell"]
        direction TB
        ALayout["layout.tsx — server gate:<br/>requireSuperAdmin() → redirect /<br/>(Rail + SubNav shell)"]
        Q1["/admin/templates (+ forms/docs detail)"]
        Q2["/admin/canvas-templates"]
        Q3["/admin/providers/ai"]
        Q4["/admin/providers/voice"]
        Q5["/admin/notifications (broadcast)"]
        ALayout --> Q1 & Q2 & Q3 & Q4 & Q5
    end

    A -. "can enter portal,<br/>org-scoped data only" .-> PLayout
    SA -. "full portal +<br/>🔒SA-only sections" .-> PLayout
    SA -. "only super_admin" .-> ALayout
```

Enforcement is **layered** — UI gates are convenience, the real walls are server-side:

| Layer | Where | What it checks |
|-------|-------|----------------|
| Route middleware | `middleware.ts` | authenticated session, CSRF same-origin on mutations |
| Layout (portal) | `src/app/(admin)/layout.tsx` | client-side `useSession()` role ∈ {admin, super_admin} |
| Layout (app-admin) | `src/app/(app)/admin/layout.tsx` → `src/middleware/auth.ts` | server-side `requireSuperAdmin()`, redirect to `/` |
| **API routes** (the wall) | `src/app/api/v2/admin/**` — per-route `getAdminUser()` | role check **plus** super-admin email allowlist (`src/lib/auth/super-admin.ts`); `admin` gets org-scoped results, `super_admin` gets global |
| UI flags | `src/hooks/use-admin.ts` → `isAdmin` / `isSuperAdmin` | conditional rendering only — not security |

> ⚠️ The two layouts gate differently on purpose: the portal admits org-`admin` (sees only their org's users/stats), while the in-app `/admin/templates|providers|notifications` pages are platform-operator tools and demand `super_admin` outright.

---

## 4. Cross-process event flow (why Redis matters)

```mermaid
flowchart LR
    RouteH["API route<br/>(web process)"] -- "enqueue" --> Q[("Redis<br/>BullMQ queues")]
    Q --> Worker["Worker process<br/>execution engine + crons"]
    Worker -- "publish event" --> PS[("Redis pub/sub<br/>events/bus.ts + domain-bus.ts")]
    PS --> Web["server.js subscriber"]
    Web -- "global.io.to(room).emit" --> Sock["Socket.io clients<br/>user:&lt;id&gt; / workflow:&lt;id&gt;"]
    Worker -- "notifications" --> PS
    Voice["voice-ws process"] -- "voice events" --> PS
```

Without Redis the system degrades hard: BullMQ jobs don't run, the auth rate limiter **fails closed** (login breaks — see ops memory), and cross-process realtime stops. Redis is a hard runtime dependency, not a cache.

---

## 5. Where things live (orientation map)

| Concern | Path |
|---------|------|
| Frontend pages | `src/app/(app)/**`, `src/app/(admin)/**` |
| UI library (compose everything from here) | `src/components/ui-kit/` (`REGISTRY.md`) |
| App shell | `src/components/shell/` (Rail, SubNav, ModuleShell) |
| Backend API | `src/app/api/v2/**` |
| Data access | `src/lib/db/models/` + `src/lib/db/repository/` |
| Auth/session | `auth.ts`, `middleware.ts`, `src/lib/auth/` |
| Workflow engine | `src/lib/workflow/` |
| AI gateway (only entry point to providers) | `src/ai/client.ts` |
| Worker entry | `scripts/workflow-worker.ts` |
| Voice WS entry | `server/voice-ws.js` |

## Related Docs

- [[overview]] — full doc index and architectural decisions
- [[data-flow]] — request/data lifecycle in detail
- [[auth-flow]] / [[authorization]] — session strategy, roles, tenancy enforcement
- [[route-handlers-part1]] / [[route-handlers-part2]] — every API route + auth requirement
- [[database]] — full model inventory
- [[deployment]] — PM2, ports, infra dependencies
