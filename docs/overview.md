# MontrAI Documentation Overview

> Scope: Single authoritative entry point for all documentation and AI agent orientation.
> Rendering context: N/A
> Project tier: 4
> Last updated: 2026-06-06

## Overview

MontrAI is a multi-tenant marketing operations SaaS built on Next.js 15 (App Router) with a custom Node server, MongoDB, PostgreSQL, BullMQ, and a mixed AI stack (Genkit + Vercel AI SDK). It combines workflow automation, social publishing, CRM, forms, docs, AI-assisted creation, design tooling, WhatsApp, marketing email, omnichannel inbox, AI bots, voice calling, and an autonomous Agent workspace into one multi-organization platform. Authentication uses NextAuth v5 (JWT strategy). All user data is scoped by organizationId enforced at the repository layer.

AGENT NOTE: This file is the first thing any agent reads. If it drifts from reality, all downstream decisions will be wrong.

## Tier Classification

TIER 4 — Auth (NextAuth v5), MongoDB + PostgreSQL databases, roles/permissions (user/admin/super_admin), Razorpay payments, BullMQ background jobs, multi-organization tenancy, pgvector embeddings, Socket.io real-time.

## Environment

- Node.js runtime via custom server (server.js), not next start
- Next.js 15.0.7 (App Router)
- Default dev port: 3000, production port: 9002 (via PM2)
- Deployment target: self-hosted VPS via PM2 (ecosystem.config.js)
- Dev command: npm run dev (runs node server.js)
- Never run next dev directly — Socket.io requires the custom server
- Dev needs NODE_OPTIONS=--max-old-space-size=8192 — the route count OOMs Node's default 4GB heap mid-compile (symptom: every request 500s, then the process dies with "Ineffective mark-compacts near heap limit"). An OOM kill mid-compile can corrupt .next (every page then 500s with "UNKNOWN: open .next/static/chunks/webpack.js") — delete .next and restart.
- Worker process: npm run worker (tsx scripts/workflow-worker.ts) — hosts workflow execution AND all agent queues (scheduled tasks + hibernation wake, autonomous mission runner, briefings/digest, metrics sync, Notion sync, trash purge). It loads `.env` only (dotenv/config), NOT `.env.local` — REDIS_URL and MONGODB_URI must be present in its environment or it exits/falls back to mongodb://localhost:27017/montrai (src/lib/mongodb.ts fallback). Mongo server-selection timeout defaults to 20s, overridable via MONGODB_SERVER_SELECTION_TIMEOUT_MS.

## Directory Map — /docs

- docs/overview.md — This file. Agent orientation and directory index.
- docs/architecture/system-architecture.md — Visual high-level map (Mermaid): processes, frontend↔backend wiring, admin/super-admin surfaces, cross-process events.
- docs/architecture/system-architecture-canvas.excalidraw.md — Same map as ONE giant Excalidraw canvas (requires Obsidian Excalidraw plugin).
- docs/architecture/folder-structure.md — Top-level directory map and naming conventions.
- docs/architecture/rendering-strategy.md — Per-route rendering strategies (SSR/CSR).
- docs/architecture/data-flow.md — How data enters, transforms, and exits the system.
- docs/modules/canvas.md — AI Canvas workflow editor module.
- docs/modules/crm.md — CRM module (contacts, companies, deals, pipelines).
- docs/modules/agent.md — Autonomous Agent workspace (missions, tools, HITL).
- docs/modules/social-media.md — Social media publishing module.
- docs/modules/inbox.md — Omnichannel inbox module.
- docs/modules/whatsapp.md — WhatsApp messaging, campaigns, automation.
- docs/modules/marketing-email.md — Marketing email campaigns.
- docs/modules/ads-analytics.md — Ads (Google/Meta campaigns, lead capture) + Analytics hub (GA4, GSC, social, unified metrics store).
- docs/ui/component-library.md — Shared UI primitives in src/components/ui/.
- docs/ui/layout-system.md — Layout hierarchy from root to page.
- docs/ui/theming.md — Design tokens, CSS variables, dark mode.
- docs/api/route-handlers-part1.md — API routes with auth requirements: Canvas, CRM, Agent.
- docs/api/route-handlers-part2.md — API routes continued: Social, Inbox/WhatsApp/Marketing Email, Notifications, Voice, AI Bots, Admin, Infrastructure.
- docs/api/external-services.md — Third-party integrations and credential patterns.
- docs/api/database.md — MongoDB models, PostgreSQL, relationships, indexes.
- docs/state/client-state.md — Client-side state: context, hooks, TanStack Query.
- docs/state/server-state.md — Server state: caching, revalidation, BullMQ.
- docs/auth/auth-flow.md — Authentication flow and session strategy.
- docs/auth/authorization.md — Roles, permissions, multi-tenancy enforcement.
- docs/infra/environment.md — All environment variables and their consumers.
- docs/infra/deployment.md — PM2 deployment, infrastructure dependencies.
- docs/infra/testing.md — Vitest unit tests, coverage scope.
- docs/infra/ha-architecture.md — High-availability topology (MongoDB replica set, Redis Sentinel, PostgreSQL standby).
- docs/how-to-docs-update.md — The docs-audit protocol used to keep this suite current.
- docs/archive/ — Superseded planning docs kept for history; not source of truth.

## Key Architectural Decisions

Custom server: server.js wraps Next.js with Socket.io at /api/socket. global.io is shared with API route handlers for real-time push. Events cross the BullMQ worker process boundary via Redis pub/sub in src/lib/workflow/events/bus.ts.

AI routing: All AI calls go through src/ai/client.ts via generateTextWithClient or streamTextWithClient. A routeHint object on each request short-circuits provider resolution; otherwise src/ai/router.ts picks via BYOK → org → plan → system → OpenRouter fallback. Never call provider SDKs directly from node processors or route handlers.

AI tool binding (2026-06-06): agent/tool-carrying calls only work on providers that REALLY bind `tools` — anthropic, openai, google, and openrouter do (all via the Vercel AI SDK; Google text rides Gemini's OpenAI-compatible endpoint at generativelanguage.googleapis.com/v1beta/openai/ with the same GEMINI_API_KEY). The old Genkit text paths flattened messages into one string prompt and silently DROPPED tools, which made agents roleplay tool calls instead of executing them — Genkit now serves only Google image/video (Imagen/Veo). client.ts logs every tool-carrying call's resolved provider and warns loudly when a provider declares toolCalling: false. Gemini additionally rejects function declarations whose JSON schema root is not a plain object (e.g. a zod discriminatedUnion at the parameters root 400s the WHOLE request) — tool parameters must be z.object at the root.

Workflow execution: src/lib/workflow/unified-execution-engine.ts drives all automation (WhatsApp, CRM, Marketing Email). Nodes run via NodeProcessorRegistry in src/lib/workflow/node-processors/index.ts. Long runs enqueue to BullMQ (npm run worker). A delay node throws ExecutionPausedForDelay, marking the run PAUSED; a future resume job continues from the stored pointer. Event-driven runs start at the trigger dispatcher (src/lib/workflow/triggers/dispatch.ts): one typed event in → all matching active workflows enqueued, with runOnce/maxExecutions/cooldownMinutes guards applied at the shared enqueue choke point. CRM mutations publish to the CRM event bus (src/lib/crm/event-handlers.ts) which fans out to legacy CRM workflows, CRM webhooks, AND the unified dispatcher. Canvas saves sync the canvas graph into its UnifiedWorkflow shadow — including the trigger derived from the canvas's trigger node — via src/lib/workflow/canvas-sync.ts, so event/cron/webhook canvases are live without a manual first run. The legacy CRM workflow engine (src/lib/crm/workflow-engine.ts) is DEPRECATED: POST /api/v2/crm/workflows returns 410; scripts/migrate-crm-workflows.ts migrates remaining legacy workflows to unified.

CRM permissions (RBAC): org-scoped CrmRole docs define per-entity permissions (read/update/delete: all|own|none, plus create/export booleans) and canManageSettings. Every /api/v2/crm route resolves a permission context and asserts via src/lib/crm/permissions.ts; own-scope adds owner filters and ownership checks. Users with no crmRoleId and platform admins (admin/super_admin) keep full access — RBAC is opt-in per user. Defaults (Admin/Member/Read only) are lazily seeded per org.

CRM soft delete: contact/company/deal/activity deletes set deletedAt (restore endpoints + /crm/trash UI); repositories exclude trashed rows by default; a daily BullMQ cron purges trash older than 30 days; ?permanent=true hard delete is platform-admin-only.

Canvas model quirk: canvas.data is stored as a single JSON string containing {nodes, edges}. canvas.userId is a plain string, not an ObjectId. organizationId is optional and backfilled lazily for legacy rows.

Multi-tenancy: Every CRM model carries organizationId (required, indexed). Every CRM repository query must filter by organizationId derived from the session user's organization record — never from client-supplied input.

Ads write guardrail: all ads-platform writes go through the allowlist at src/lib/ads/write-ops/ — create-only, campaign-level status hardcoded to PAUSED, every call audited to ad_write_audits, only ever triggered by an explicit user action. Explicit user action means either POST /api/v2/ads/campaigns (the campaign wizard) or — since 2026-06-05 (decision D1) — an approved agent HITL card: the agent's create_ad_campaign tool has hitlPolicy 'always', the approval card shows the complete draft (account, budget, targeting, creative), and approval routes to the same createCampaignFromSpec orchestration. No update/delete/pause-toggle operations exist anywhere; campaigns are always created PAUSED and the user activates them. This protects users' ad accounts from automation bans — do not relax it.

AGENT AVOID: Never use next dev. Never call AI provider SDKs directly. Never trust client-supplied organizationId. Never add ads-platform write calls outside src/lib/ads/write-ops/.

## Cross-Cutting Concerns

Auth strategy: NextAuth v5 JWT sessions. Session contains id, role, organizationId, twoFactorEnabled. Middleware at middleware.ts enforces authentication and admin-only routes. CSRF same-origin check on all POST/PUT/PATCH/DELETE mutations.

Error handling: Structured JSON logger at src/lib/logger.ts forwards errors to Sentry (sentry.client/server/edge.config.ts).

Security: SSRF via safeOutboundFetch in src/lib/workflow/ssrf-guard.ts. Auth rate limiting fails closed (src/lib/auth/rate-limit.ts). AI rate limiting fails open (src/lib/ai/rate-limit.ts).

Integrations hub: third-party marketing-tool connections (Mailchimp, HubSpot, Airtable, Zoho, Webflow, Blogger, Apollo, Semrush, RevenueCat, n8n, Shopify, self-hosted WordPress) are declared once in the provider registry at src/lib/integrations/registry.ts and connect through one generic OAuth2/API-key flow under /api/v2/integrations. Credentials are stored encrypted in the integration_connections collection with hybrid ownership: organizationId required, brandId optional; resolution prefers the brand-pinned connection and falls back to the org-level one. Workflow nodes resolve credentials server-side via src/lib/integrations/server/processor-credentials.ts — never from node config.

Social OAuth engine: brand-scoped social/utility account connections (19 platforms) run through one config-driven engine at src/lib/social/oauth/ (engine + per-platform configs in platforms/), served by the dynamic /api/social/oauth/[platform] route pair — per-platform redirect URIs unchanged. Each config's persist hook owns storage (social_accounts; gmail/outlook ?source=crm to CRM email accounts; calendar flows to CRM calendar accounts; google-drive to user storage; facebook/instagram hand off to the static meta asset-selector sub-routes). Telegram's bot-token POST stays a static route. Adding a platform = one config file + one registry line in platforms/index.ts — never a new route directory. This is a separate system from the Integrations hub above (different storage, different scoping).

Data fetching pattern: TanStack Query (src/components/providers/query-provider.tsx) for client-side server state. Direct fetch in Server Components where applicable.

Styling: All UI composes from the centralized ui-kit at src/components/ui-kit/ (catalog: src/components/ui-kit/REGISTRY.md), with shadcn/ui in src/components/ui/ underneath for primitives the kit does not cover. App chrome is the shell in src/components/shell/ (overlay Rail, per-module SubNav registered in subnav-registry.ts, ModuleShell) plus src/components/app-header.tsx. Tokens in src/app/globals.css: cool violet-tinted neutrals, near-black --primary, violet --brand as accent only; dark mode is cool charcoal via the .dark class. Fonts: Inter and JetBrains Mono.

## Glossary

Canvas — A ReactFlow-based workflow graph stored as a JSON string in the canvases collection. Each canvas belongs to one user and optionally one organization.

Mission — An autonomous AI agent task with defined limits (tool calls, tokens, credits, wall-clock time). Lives in agent_missions collection.

Execution — A workflow run record (UnifiedWorkflowExecution). Tracks status, per-node steps, variables, and the resume pointer for paused runs.

routeHint — An object passed to generateTextWithClient specifying sdk (genkit|ai-sdk), provider, and keySource to select the correct AI backend.

organizationId — The tenant scope key. An ObjectId string linking a user to their organization. Required on all CRM data. Optional on canvases (legacy).

Brand — A per-organization workspace identity that scopes social accounts, knowledge, and content. Brand selection is mandatory platform-wide: a default brand is always selected, and brand-scoped surfaces read currentBrandId from the CurrentBrandProvider context (src/hooks/use-current-brand.tsx).

BYOK — Bring Your Own Key. Users can supply their own API keys for AI providers if their plan allows it. Key source flows through routeHint.

HITL — Human-in-the-loop. Agent actions that require user approval before proceeding, managed by src/lib/agent/hitl-gateway.ts.

Credit — A metered usage unit for AI calls and scraping services, tracked in credit_usages collection per user per billing period.

IntegrationConnection — A connected third-party business-tool account (integration_connections collection). Owned by an organization, optionally pinned to a brand; holds an AES-256-GCM-encrypted credential blob. Distinct from SocialAccount, which remains the store for social-publishing OAuth accounts.

DocSyncLink — A link between a MontrAI document and a Notion page (doc_sync_links collection) with a sync direction (pull, push, or two_way). A 15-minute BullMQ cron polls both sides; on a two-way conflict the newer edit wins and the losing local content is snapshotted to DocVersion.

AdAccount — A connected Google Ads or Meta ad account (ad_accounts collection) with encrypted OAuth tokens. Distinct from SocialAccount (social publishing) and IntegrationConnection (business tools). Google Ads connections also carry the webhookKey used to authenticate lead-form deliveries.

MetricsSnapshot — One entity × day row in the unified analytics time-series (metrics_snapshots collection) feeding the Ads and Analytics modules. Sources: Meta/Google ads, GA4, Search Console, account-level social. Only additive metrics are stored; ratios are computed at query time. Synced by the source-metrics-sync BullMQ cron (6-hourly + 90-day backfill on connect).

AdLead — A lead captured from Meta Lead Ads or Google lead forms (ad_leads collection), bridged into the CRM via the X2 identity resolver with source 'ads'. Custom form questions map to CRM fields via per-form AdLeadFieldMap rows (configured on Ads ▸ Leads); failed syncs notify org admins (ads.lead_sync_failed) and are retryable from Ads ▸ Leads.

CrmRole — An org-scoped CRM role (crm_roles collection) with per-entity permissions ({read|update|delete: all|own|none, create/export booleans}) and canManageSettings. Assigned via User.crmRoleId; null = legacy full access. Enforced by src/lib/crm/permissions.ts in every /api/v2/crm route.

RecordLink — A polymorphic any↔any relation between CRM records (crm_record_links collection): {sourceType, sourceId, targetType, targetId, linkType}. Additive to the canonical direct FKs (deal.contactId etc.); surfaced as "Related records" on detail pages.

DedupeRule — Per-org, per-entity declarative duplicate criteria (crm_dedupe_rules collection): an OR-list of AND-field-sets (defaults: contact [email]|[phoneNormalized], company [domain]|[name]). Checked on create (409 duplicate_suspected unless forced), at import, and powering the /crm/duplicates review surface.

Agent Workspace — The agent's user-readable filesystem: a system-provisioned, brand-scoped folder tree in the Docs module (root identified by referenceType 'agent_workspace' + referenceId brandId; subfolders Strategies/Research/Drafts/Reports/Playbooks + a pinned "Agent Memory" doc). Vertical starter playbooks are seeded on first provisioning by BrandContext.industry; the strategy generator consumes Playbooks/ content; completed missions auto-write Reports/ docs.

AgentControlBinding — A paired owner phone for the WhatsApp control channel (agent_control_bindings collection): PAIR-code activation (sha256 hash, 10-min expiry, 3 attempts), per-command rate limiting, approval-number map. The WhatsApp webhook diverts bound phones to the control handler BEFORE any CRM/bot processing.

## Recent Changes

[2026-06-06] Agent E2E runtime QA — first live pass, 10 bugs found and fixed: (1) CRITICAL — Genkit-based google/openai providers silently dropped `tools` while declaring toolCalling:true, so agents roleplayed tool calls platform-wide (zero tool events had ever been written); both text paths rewritten to the Vercel AI SDK (Gemini via its OpenAI-compatible endpoint), tool-binding observability added to client.ts, Genkit retained for Imagen/Veo only. (2) Autonomous mission loop died after exactly one turn — BullMQ silently drops add() when jobId matches a retained completed job; dispatchMissionContinuation now uses unique per-enqueue jobIds (parallel-run protection lives in the worker's status checks). (3) Admin plans API stripped features.agent entirely (zod schema had no agent key — the panel's Agent section NEVER persisted since B1-0.6). (4) Worker process couldn't boot: AI flows imported next-auth at module scope (@auth/mongodb-adapter unresolvable under tsx) — 4 flows lazy-import auth; queue worker imports concrete publish-flow modules, not the @/ai/flows barrel. (5) Agent-tasks cron + mission-runner had NO consumer in any process — both now started by scripts/workflow-worker.ts. (6) Resuming an old mission instantly terminated wallclock_exceeded — a user chat message now stamps sessionStartedAt and clears terminatedReason. (7) create_ad_campaign's discriminatedUnion params 400'd ALL Gemini tool calls — flattened object params, canonical zod validated in execute. (8) Agent chat now renders markdown (react-markdown for assistant bubbles); (9) specialist dropdown synced to AGENT_DEFINITIONS (showed removed @automation, missed @strategy/@voice/@inbox/@ops); (10) Mongo serverSelectionTimeoutMS 5000 flaked worker boots on SRV-slow machines — 20s default, env-overridable. New AI tasks agentStrategy/agentCompaction (admin-routable models; strategy generator + compaction no longer hardcode models). Verified live: wake cron (wake #1 → active → autonomous turn ran), plan-gate deny/allow cycle, plans panel persistence, settings cards, markdown. Full QA log: docs/plan/agent-autonomy-todo-2026-06-05.md header — agent.md, this file.
[2026-06-05] WhatsApp control channel (G12): owners drive the agent from WhatsApp — PAIR-code binding (agent_control_bindings, sha256 + attempt cap + rate limit, all audited), webhook divert before CRM/bot processing, commands status/approve/reject/goal/stop (ad-campaign + bulk-call approvals app-only), pairing card in Agent ▸ Settings, /api/v2/agent/control-channel — agent.md, build status docs/plan/whatsapp-control-channel-todo-2026-06-05.md. Pending: live-WABA QA.
[2026-06-05] CRM-vs-Twenty initiative — all phases built (report temp/crm-vs-twenty-comparison-2026-06-05.md, status temp/crm-vs-twenty-comparison-todo-2026-06-05.md). Automation: CRM events finally wired (mutation routes → CRM event bus → legacy workflows + webhooks + unified dispatcher — previously NOTHING emitted, legacy workflows/webhooks were dormant); canvas→UnifiedWorkflow trigger sync on save (src/lib/workflow/canvas-sync.ts; previously trigger hardcoded 'manual' on first execute); new trigger subtypes record_deleted/deal_won/deal_lost/task_completed; dispatcher execution guards (runOnce/maxExecutions/cooldown); manual run-on-records API (/api/v2/crm/automations) + "Run automation" UI; 13 CRM action canvas nodes + find_record/delete_record/log_note processors; form_input human-in-the-loop pause/resume node + /workflows/forms; legacy CRM workflow engine deprecated (410 POST, migrator + scripts/migrate-crm-workflows.ts — run, 0 legacy docs). Data: soft delete/trash + restore + daily purge cron; multi-value contact emails[]/phones[] with primary→scalar mirroring (scripts/backfill-contact-identities.ts — run) and a fixed reversed-args findByEmail bug that silently broke email/calendar auto-link in all 5 sync drivers; declarative dedupe rules + /crm/duplicates; polymorphic RecordLinks. Email: per-account auto-create contacts/companies from senders (noise-guarded, dedupe-aware) + sender blocklist. Views/UI: record side-panel preview (per-view openRecordIn), table grouping, server-side nested AND/OR filterTree (src/lib/crm/filter-query.ts — view filters were previously client-side and lossy), record calendar views (deals/activities), generalized drag-drop RecordKanban with aggregates, per-org record-detail layouts, per-user composable CRM dashboard. Reporting: /crm/reports (forecast committed/weighted/bestCase + overdue, stage-conversion from stageHistory) + /api/v2/crm/stats/{forecast,stage-conversion}. RBAC: CrmRole + src/lib/crm/permissions.ts enforced across all ~120 CRM routes + /crm/settings/roles UI. Custom objects: design doc only (docs/plan/crm-custom-objects-design-2026-06-05.md, build deferred) — crm.md, route-handlers-part1.md, database.md, authorization.md, canvas.md, server-state.md, overview.md.

[2026-06-05] Agent autonomy Phases 2+3: mission triggers now actually registered at startup (server.js + worker — the subscriber was never called before) and extended to inbound-channel domain events (whatsapp.message_received / message.received / ai_bot.escalation_requested / ads.lead_captured / meeting.booked / voice.call_completed — new publishers in the WhatsApp webhook, inbox service, ads crm-intake, calendar tool); triggered missions spawn active with ownership-aware context and optional autonomous mode. prospect-engagement template (cross-channel one-thread orchestration). D4 voice-call policy per brand (always_ask/always_autonomous/conditional) in BrandContext + HITL gateway + settings UI. D1 ads path: create_ad_campaign agent tool (hitlPolicy always → write-ops allowlist, create-only PAUSED). Compaction engine v2 (token-based, prune, running summary, AI-client-routed). Social depth (schedulePost fan-out + scheduledFor, list_social_accounts/list_scheduled_posts/get_post_performance). Ingestion tools (ingest_website/import_social_content/analyze_inspiration). Playbooks: vertical starters seeded into the workspace, strategy generator consumes them; mission outcomes indexed into the KB. Task-routed models (agentStrategy/agentCompaction AI tasks). list_integrations awareness tool. Server-side relative-fetch bugs fixed across calendar/forms/email/voice tools. MCP + WhatsApp-control designs: docs/plan/agent-phase3-deferred-designs-2026-06-05.md. Status: docs/plan/agent-autonomy-todo-2026-06-05.md.
[2026-06-05] Agent autonomy Phase 1: Goal Mode (generate/activate/iterate_strategy tools — one HITL approval turns a business goal into dep-ordered missions), Agent Workspace (brand-scoped folder tree + Agent Memory doc in the Docs module, list/read/write workspace tools on every specialist, auto mission reports), agent self-scheduling (create_scheduled_task / create_mission_trigger, HITL-gated, plan-capped via new IPlanFeatures.agent.maxActiveSchedules + minWakeIntervalMinutes — super-admin editable), long-horizon hibernation (sleep_until + wakeAt + per-wake-session wall-clock), daily agent briefing (09:00 cron). Also: voice-agent specialist added, automation-agent folded into ops-agent, setPlanStep registered + HITL/budget-exempt, CRM company tools, ~17 orphaned tools wired, broken server-side fetch in doc tools fixed, plan-default model fallback fixed — agent.md, this file. Plan + status: docs/plan/agent-autonomy-todo-2026-06-05.md.
[2026-06-05] Added docs/architecture/system-architecture-canvas.excalidraw.md — single-canvas Excalidraw version of the architecture map for Obsidian (generated scene JSON; edit freely in Excalidraw view).
[2026-06-05] Added docs/architecture/system-architecture.md — Mermaid visual map of process topology (server.js / worker / voice-ws), the three frontend→backend transport paths, the dual admin surface split ((admin) portal vs (app)/admin pages, disjoint /admin/* sub-paths), and the Redis-glued cross-process event flow.
[2026-06-05] Ads backlog close-out documented: ad_accounts/analytics_sources/metrics_snapshots/ad_leads/ad_lead_field_maps/ad_write_audits models added to the inventory; new "Ads and Analytics Routes" section (OAuth, v2 APIs, public lead webhooks, create-only guardrail note); source-metrics-sync + ads-weekly-summary queue jobs; Ads & Analytics env-var section (GOOGLE_ADS_DEVELOPER_TOKEN, META_LEADS_WEBHOOK_VERIFY_TOKEN, FACEBOOK_APP_SECRET prod fail-closed note); ads.lead_sync_failed/ads.weekly_summary domain events + per-form lead field mapping — database.md, route-handlers-part2.md, server-state.md, environment.md, ads-analytics.md, overview.md.
[2026-06-05] Legacy social OAuth consolidated: 21 per-provider route directories deleted; one generic engine (src/lib/social/oauth/) + dynamic [platform] route pair serves 19 platforms config-driven; telegram (bot token) and meta asset-selector stay static; dead shopify/wordpress legacy routes removed; tiktok added to the SocialPlatform union — route-handlers-part2.md, social-media.md, external-services.md, environment.md (social OAuth env vars documented, GOOGLE_DRIVE_CLIENT_ID fallback note), overview.md (Social OAuth engine cross-cutting entry).
[2026-06-05] Ads + Analytics modules documented: AdAccount/AnalyticsSource/MetricsSnapshot/AdLead/AdWriteAudit models, ads + analytics OAuth flows, lead-capture webhooks, create-only PAUSED write guardrail, source-metrics-sync cron, /ads and /analytics page trees, ai:ads-copy + ai:ads-insights rate buckets — new docs/modules/ads-analytics.md; overview.md (this entry, glossary, key decisions).
[2026-06-05] Integrations backlog close-out documented: integration_import_records staging model, [id]/import + notion-import + publish-wordpress routes, Mailchimp inbound webhook, integration_webhook workflow trigger, Shopify webhook auto-registration — database.md, route-handlers-part2.md, external-services.md.
[2026-06-05] Integrations expansion documented: provider registry + generic OAuth/API-key connect flow, IntegrationConnection and DocSyncLink models, /api/v2/integrations and notion-sync routes, Shopify/RevenueCat inbound webhooks, integration-token-refresh and notion-doc-sync BullMQ crons, 12 new integration workflow nodes — external-services.md, database.md, route-handlers-part2.md, environment.md, server-state.md, canvas.md, overview.md.
[2026-06-04] Full drift audit and update of the docs suite against the post-2026-05-20 codebase — 21 files touched.
[2026-06-04] route-handlers.md split into route-handlers-part1.md (Canvas, CRM, Agent) and route-handlers-part2.md (Social, Inbox/WhatsApp/Marketing Email, Notifications, Voice, AI Bots, Admin); documented agent, voice, notification, ai-bot, and admin route groups — route-handlers-part1/2.md.
[2026-06-04] Documented ~40 missing models (agent strategies, notifications, AI bots, AI studio, voice, brands, canvas-template reviews, WhatsApp auxiliaries) — database.md.
[2026-06-04] UI docs synced to the rebuilt shell: ui-kit is the canonical component library; Rail + central SubNav registry replace the removed AppSidebar; tokens are cool neutrals with near-black --primary and violet --brand accent — component-library.md, layout-system.md, theming.md.
[2026-06-04] Renamed page trees: (app)/conversations → (app)/inbox, (app)/marketing → (app)/campaigns (campaigns page is a Server Component); canvas execute returns BullMQ-enqueued JSON, not SSE — rendering-strategy.md, inbox.md, folder-structure.md.
[2026-06-04] Voice subsystem documented: Twilio is voice-only with DB-encrypted credentials (stale TWILIO_* env vars removed), STT/TTS providers added, standalone voice-ws process added — external-services.md, environment.md, deployment.md.

## Update Triggers

Update this file when any doc file is added, removed, or significantly restructured, or when any top-level architectural decision changes.

## Related Docs

- docs/architecture/folder-structure.md — Directory map of source code
- docs/auth/auth-flow.md — Detailed auth and session behavior
- docs/api/database.md — Full model inventory
