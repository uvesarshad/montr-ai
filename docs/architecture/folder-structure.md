# Folder Structure

> Scope: Maps every top-level directory to its purpose and notes naming conventions.
> Rendering context: N/A
> Project tier: 4
> Last updated: 2026-06-04

## Overview

MontrAI follows Next.js App Router conventions under src/app, with domain logic separated into src/lib and UI separated into src/components. All new API routes go under src/app/api/v2/. The custom Node server lives at the project root.

## Root-Level Files

- server.js — Custom Node HTTP server that wraps Next.js and attaches Socket.io. Entry point for npm run dev and npm run start.
- ecosystem.config.js — PM2 process configuration. Production process name: montrai, port: 9002.
- middleware.ts — Next.js edge middleware. Enforces auth, CSRF, and admin-route guards.
- auth.ts — NextAuth v5 initialization with providers, adapter, and JWT/session callbacks.
- auth.config.ts — Shared auth config (pages, session strategy, base callbacks). Used by both auth.ts and middleware.ts to avoid circular imports.
- next.config.ts — Next.js configuration.
- tailwind.config.ts — Tailwind CSS configuration with design tokens.
- vitest.config.ts — Vitest unit test configuration (pure unit tests only, no DB).

## src/app/

Framework special files and route segments.

- src/app/layout.tsx — Root layout. Wraps all pages with QueryProvider, NextAuthProvider, ThemeProvider, I18nProvider, and Toaster.
- src/app/globals.css — Global CSS custom properties (design tokens, dark mode variables).
- src/app/(app)/ — Protected route group. layout.tsx checks session client-side and mounts the app shell: Rail and per-module SubNav (from src/components/shell/), AppHeader, AgentLauncher, GlobalSearchProvider, and TourGuide.
- src/app/(admin)/ — Admin-only route group.
- src/app/api/v2/ — All API route handlers. One subdirectory per domain (canvases, crm, social, users, etc.).
- src/app/api/ — Legacy API routes (avoid adding new routes here).
- src/app/login/, src/app/signup/, src/app/verify-email/, src/app/forgot-password/, src/app/reset-password/ — Public auth pages.
- src/app/p/ — Public document viewing (no auth required).

AGENT NOTE: New API routes always go under src/app/api/v2/, never under src/app/api/ (legacy).

## src/lib/

Server-side domain logic. No React imports here.

- src/lib/db/models/ — Mongoose model definitions. Naming: kebab-case.model.ts (e.g., canvas.model.ts). CRM models live in src/lib/db/models/crm/.
- src/lib/db/repository/ — Data access layer. Naming: kebab-case.repository.ts. CRM repositories in src/lib/db/repository/crm/.
- src/lib/workflow/ — Workflow execution engine, node processors, variable resolver, SSRF guard, BullMQ queue config.
- src/lib/agent/ — Agent mission logic, tool registry, HITL gateway, compaction engine, scheduled task runner.
- src/lib/crm/ — CRM-specific utilities (audit, event handlers, webhook delivery, email/calendar sync).
- src/lib/auth/ — Auth utilities (rate limiting, 2FA, super-admin check, session helpers).
- src/lib/storage/ — File upload and storage service (S3/Wasabi, Google Drive, local providers).
- src/lib/marketing-email/ — Marketing email send logic, provider adapters.
- src/lib/whatsapp/ — WhatsApp API integration, jobs, automations.
- src/lib/inbox/ — Omnichannel inbox utilities (chatbot, adapters, workspace).
- src/lib/ai/ — AI-layer utilities (rate limiting, model groups, model registry).
- src/lib/ai-bots/ — AI bot runtime, channel senders, tools, and reply-suppression logic.
- src/lib/ai-studio/ — AI Studio workspace orchestration, batch runs, characters, and the Studio↔Canvas asset-bridge.
- src/lib/voice/ — Voice subsystem: provider abstraction and registry, selection chain, plan gating, cost reconciliation, server and provider adapters.
- src/lib/socket/ — Socket server module (server.ts). Note: the live socket server is wired in root server.js; this holds the supporting server logic.
- src/lib/notifications/ — In-app notification pipeline: notification-bus, dispatcher, service, and email digest.
- src/lib/events/ — Domain event bus (domain-bus.ts) for in-process and cross-process event fan-out.
- src/lib/approvals/ — Human-in-the-loop approval gateway.
- src/lib/queue/ — BullMQ queue setup, WhatsApp queue, and worker entry (npm run worker).
- src/lib/mongodb.ts — MongoDB/Mongoose connection singleton. Export connectDB (alias for connectMongoose).
- src/lib/redis.ts — ioredis singleton. Export getRedisClient.
- src/lib/logger.ts — Structured JSON logger with Sentry forwarding.
- src/lib/credit-service.ts — Credit allocation and consumption (server-side only).
- src/lib/plan-enforcement.ts — Plan limit checks before resource creation.
- src/lib/rate-limiter.ts — Generic rate limiter using Redis sliding-window algorithm.
- src/lib/utils.ts — Shared utility functions (cn for className merging, etc.).

## src/components/

- src/components/ui-kit/ — The canonical centralized UI component library. All UI composes from here (barrel index.ts, catalog REGISTRY.md). Files: primitives.tsx (Button, IconButton, Chip, Avatar, Input, Segmented, Tabs, Meter, Spinner), surfaces.tsx (Card, KpiTile, StatCard, Table, EmptyState, Skeleton), blocks.tsx (KpiRow, DealCard, PipelineColumn, ActivityItem, ChatBubble, WaPhonePreview, FlowNode, ConversationItem), charts.tsx (Spark, AreaChart, Donut).
- src/components/shell/ — App shell chrome built on the ui-kit. rail.tsx (overlay module-switcher rail), sub-nav.tsx (per-module gutter sub-nav), subnav-registry.ts (single source of truth where per-module sub-nav routes are registered — never mount per-module subnavs in module layouts), module-shell.tsx (module-level layout primitive: sub-rail + title strip + loading/empty/error templates), shell-context.tsx (shared chrome state, e.g. SubNav open/closed flag).
- src/components/ui/ — shadcn/ui primitives (Dialog, DropdownMenu, Sheet, Popover, Form, Tooltip, etc.) that sit underneath the ui-kit for primitives it does not cover.
- src/components/providers/ — Context providers (NextAuthProvider, QueryProvider, ThemeProvider).
- src/components/canvas/ — Canvas module UI (toolbar, radial-menu, node components, dialogs).
- src/components/crm/ — CRM module UI (data grid, contact/company/deal forms and lists).
- src/components/agent/ — Agent module UI (launcher, shell, mission cards).
- src/components/app-header.tsx — Page header with breadcrumbs and actions.
- src/components/search/ — Global search provider and command palette.

AGENT NOTE: Compose all UI from src/components/ui-kit/ (barrel @/components/ui-kit). Do not hand-roll buttons/cards/chips/tables inline; add missing pieces to the kit + REGISTRY.md instead.

## src/hooks/

Custom React hooks. Naming: use-kebab-case.ts.

- src/hooks/crm/ — CRM data-fetching hooks (use-contacts.ts, use-deals.ts, etc.).
- src/hooks/agent/ — Agent mission hooks.
- Root hooks: use-profile.ts, use-socket.ts, use-canvases-v2.ts, use-docs-v2.ts, use-workflows.ts, etc.

## src/ai/

AI abstraction layer.

- src/ai/client.ts — Unified AI generation entry point (server-side). All callers must use generateTextWithClient or streamText from here.
- src/ai/genkit.ts — Genkit instance initialization.
- src/ai/types.ts — RouteHint and ApiKeys type definitions.
- src/ai/flows/ — Genkit flow definitions.

## src/validations/ and src/types/

- src/validations/ — Zod schemas. CRM schemas in src/validations/crm/.
- src/types/ — TypeScript interfaces. CRM types in src/types/crm.ts.

## scripts/

Utility scripts (migrations, seed data, debug helpers). Not part of the application. Run with tsx scripts/<name>.ts.

## Naming Conventions

- React components: PascalCase files and exports (e.g., ContactForm.tsx).
- Route handlers: route.ts inside the directory segment.
- Models: kebab-case.model.ts.
- Repositories: kebab-case.repository.ts.
- Hooks: use-kebab-case.ts.
- Zod schemas: kebab-case.schema.ts.
- API routes mirror the resource name: src/app/api/v2/crm/contacts/route.ts.

## Update Triggers

Update this file when any top-level folder is added, renamed, or removed, or when naming conventions change.

## Related Docs

- docs/overview.md — Project-wide architecture summary
- docs/api/database.md — Model and repository inventory
- docs/api/route-handlers-part1.md and docs/api/route-handlers-part2.md — API route map
