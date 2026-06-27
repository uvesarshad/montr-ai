# API Route Handlers (Part 1: Canvas, CRM, Agent)

> Scope: API routes by domain — paths, methods, auth requirements, and purpose.
> Rendering context: Server-side
> Project tier: 4
> Last updated: 2026-06-06

## Overview

API routes live under src/app/api/v2/, with two legacy exceptions still in active use: the social module under src/app/api/social/ and the agent chat endpoint at src/app/api/agent/chat/. Every protected route calls auth() to get the session. Responses follow { data } for success and { error: string } for failures. Pagination responses use { data: [], pagination: { page, limit, total, totalPages, hasMore } }. All mutation routes are CSRF-protected by middleware.ts.

AGENT NOTE: New routes always go under src/app/api/v2/. Never add to src/app/api/ (legacy). Always call auth() as the first step in any route handler.

AGENT SEE: docs/architecture/data-flow.md — full request lifecycle

## Canvas Routes

src/app/api/v2/canvases/
- GET /api/v2/canvases — list user's canvases. Auth: required. Filters: search, page, limit.
- POST /api/v2/canvases — create canvas. Auth: required. Body: name, optional data JSON string.

src/app/api/v2/canvases/[id]/
- GET /api/v2/canvases/[id] — get canvas by id. Auth: required. Returns canvas with presigned preview URL.
- PUT /api/v2/canvases/[id] — update canvas name or data. Auth: required.
- DELETE /api/v2/canvases/[id] — delete canvas. Auth: required.

src/app/api/v2/canvases/[id]/execute/
- POST /api/v2/canvases/[id]/execute — trigger workflow execution. Auth: required. Enqueues to BullMQ and returns JSON with executionId and status (pass wait=false to skip waiting); progress events arrive client-side over Socket.io.

src/app/api/v2/canvas-templates/ — GET, POST. Auth: required. Template marketplace listing/publishing.
src/app/api/v2/canvas-templates/my/ — GET. Auth: required. Caller's own templates.
src/app/api/v2/canvas-templates/[id]/ — GET, (publish via subroute). Auth: required.
src/app/api/v2/canvas-templates/[id]/publish/ — POST. Auth: required.
src/app/api/v2/canvas-templates/[id]/reviews/ — GET, POST, DELETE. Auth: required. Template reviews.
src/app/api/v2/canvas-templates/[id]/reviews/[reviewId]/helpful/ — POST. Auth: required. Mark review helpful.
src/app/api/v2/canvas-webhooks/ — Inbound webhooks triggering canvas execution. Auth: verified by signature.

## CRM Routes — Permission Model

Beyond auth(), all /api/v2/crm handlers enforce CRM RBAC via src/lib/crm/permissions.ts. getCrmPermissionContext resolves the session user's crmRoleId to a CRM role; assertCrmPermission(ctx, entity, action) is called per handler with entity = contact | company | deal | activity and action = read | create | update | delete | export, returning a scope ('all' | 'own') and throwing 403 on denial. Own-scope reads/lists add an owner filter (ownerId, or assignedTo for activities); own-scope single-record mutations verify record ownership; bulk routes (assertBulkCrmPermission) reject own-scope users with 403; settings/automation routes use assertCanManageSettings; exports are export-gated. Platform admins (role admin/super_admin) and users with no crmRoleId bypass all checks (back-compat). Per-route entries below note the entity/action enforced.

AGENT NOTE: organizationId is always read from the session user's DB record, never from the request body. The view filterTree query param (filterTree JSON, on contacts/companies/deals list routes) is sanitized server-side via src/lib/crm/filter-query.ts and cannot override org scope.

## CRM Routes — Core

src/app/api/v2/crm/contacts/ — GET (list; filterable incl. filterTree JSON param; contact read), POST (create; contact create; returns 409 duplicate_suspected unless ?force=true or body ignoreDuplicates:true). Auth: required. organizationId from session.
src/app/api/v2/crm/contacts/[id]/ — GET (read), PUT (update), DELETE (soft-delete to trash; ?permanent=true hard-deletes, platform admin only). Auth: required.
src/app/api/v2/crm/contacts/[id]/restore/ — POST. Auth: required. Restores a soft-deleted contact.
src/app/api/v2/crm/contacts/[id]/merge/ — POST. Auth: required. Merge duplicate contacts.
src/app/api/v2/crm/companies/ — GET (list; filterTree param; company read), POST (company create; 409 dedupe). Auth: required.
src/app/api/v2/crm/companies/[id]/ — GET, PUT, DELETE (soft; ?permanent=true admin-only). Auth: required.
src/app/api/v2/crm/companies/[id]/restore/ — POST. Auth: required.
src/app/api/v2/crm/deals/ — GET (list; filterTree param; deal read), POST (deal create; 409 dedupe). Auth: required.
src/app/api/v2/crm/deals/kanban/ — GET kanban view. Auth: required.
src/app/api/v2/crm/deals/[id]/ — GET, PUT, DELETE (soft; ?permanent=true admin-only). Auth: required.
src/app/api/v2/crm/deals/[id]/restore/ — POST. Auth: required.
src/app/api/v2/crm/deals/[id]/stage/ — PATCH (move stage). Auth: required.
src/app/api/v2/crm/deals/[id]/{won,lost,reopen}/ — POST. Auth: required. Mark deal won/lost/reopened (emits CRM events).
src/app/api/v2/crm/pipelines/ — GET, POST. Auth: required.
src/app/api/v2/crm/pipelines/[id]/ — GET, PUT, DELETE. Auth: required.
src/app/api/v2/crm/activities/ — GET (timeline; activity read), POST (activity create). Auth: required.
src/app/api/v2/crm/activities/[id]/ — GET, PUT, DELETE. Auth: required.
src/app/api/v2/crm/timeline/ — GET unified timeline. Auth: required.

## CRM Routes — Features

src/app/api/v2/crm/tags/ — GET, POST, PUT [id], DELETE [id]. Auth: required.
src/app/api/v2/crm/views/ — GET, POST. Auth: required. Saved filter configurations.
src/app/api/v2/crm/views/[id]/ — GET, PUT, DELETE. Auth: required.
src/app/api/v2/crm/favorites/ — GET, POST, DELETE. Auth: required.
src/app/api/v2/crm/comments/ — GET, POST. Auth: required.
src/app/api/v2/crm/comments/[id]/ — PUT, DELETE. Auth: required.
src/app/api/v2/crm/attachments/ — GET, POST (upload), DELETE [id]. Auth: required.
src/app/api/v2/crm/custom-fields/ — GET, POST, PUT [id], DELETE [id]. Auth: required.
src/app/api/v2/crm/audit-logs/ — GET. Auth: required. Read-only.
src/app/api/v2/crm/import/ — POST (upload CSV). Auth: required. Commit consults dedupe rules.
src/app/api/v2/crm/export/{contacts,companies,deals}/ — GET. Auth: required. Export-gated per entity (export permission).
src/app/api/v2/crm/stats/overview, stats/deals, stats/activities, stats/leaderboard, stats/pipeline/[id] — GET. Auth: required. Dashboard/report metrics.
src/app/api/v2/crm/stats/forecast/ — GET. Auth: required. Sales forecast (period/horizon/pipelineId/ownerId): committed/weighted/bestCase/byOwner/overdue.
src/app/api/v2/crm/stats/stage-conversion/ — GET. Auth: required. Stage conversion (history-advance method).
src/app/api/v2/crm/trash/ — GET (list soft-deleted by entityType; contact read). Auth: required.
src/app/api/v2/crm/trash/empty/ — POST. Auth: required. Hard-deletes all trashed records.
src/app/api/v2/crm/duplicates/ — GET. Auth: required. Suspected duplicates per dedupe rules.
src/app/api/v2/crm/dedupe-rules/ — GET, PUT. Auth: required. Manage declarative dedupe rules (settings-gated).
src/app/api/v2/crm/links/ — GET (links touching a record, hydrated), POST (create any↔any link; contact update). Auth: required.
src/app/api/v2/crm/links/[id]/ — DELETE. Auth: required.
src/app/api/v2/crm/blocklist/ — GET, POST. Auth: required. Email auto-create blocklist.
src/app/api/v2/crm/blocklist/[id]/ — DELETE. Auth: required.
src/app/api/v2/crm/record-layouts/ — GET, PUT. Auth: required. Per-entity detail/form layouts (settings-gated).
src/app/api/v2/crm/dashboard/ — GET, PUT. Auth: required. Per-user CRM overview widget order/visibility (11-widget catalog incl. forecast).
src/app/api/v2/crm/roles/ — GET, POST. Auth: required. CRM RBAC roles (settings-gated). Admin/Member/Read-only lazy-seeded.
src/app/api/v2/crm/roles/[id]/ — GET, PUT, DELETE. Auth: required.
src/app/api/v2/crm/roles/assign/ — POST. Auth: required. Assign a CRM role to a user.
src/app/api/v2/crm/members/ — GET. Auth: required. Org members + assigned CRM roles.

## CRM Routes — Sync and Automation

src/app/api/v2/crm/email-accounts/ — GET, POST (connect), DELETE [id]. Auth: required.
src/app/api/v2/crm/emails/ — GET, POST (send). Auth: required.
src/app/api/v2/crm/calendar-accounts/ — GET, POST, DELETE [id]. Auth: required.
src/app/api/v2/crm/events/ — GET, POST. Auth: required.
src/app/api/v2/crm/automations/ — GET. Auth: required. Lists manual-trigger unified workflows available to run on CRM records (settings-gated).
src/app/api/v2/crm/automations/run/ — POST. Auth: required. Enqueues manual unified-workflow runs against ≤100 records (source 'manual-crm', per-org execute rate-limited, settings-gated).
src/app/api/v2/crm/workflows/ — GET (deprecated:true), POST (returns 410). Auth: required. AGENT NOTE: legacy CRM workflows are DEPRECATED — use unified workflows; migration via scripts/migrate-crm-workflows.ts.
src/app/api/v2/crm/workflows/[id]/ — GET (deprecated:true), PATCH, DELETE. Auth: required. Owner-only; settings-gated.
src/app/api/v2/crm/workflows/[id]/activate/ — POST (also PATCH). Auth: required. Owner-only; activates workflow. AGENT NOTE: PATCH is aliased to POST (export const PATCH = POST) for client compatibility.
src/app/api/v2/crm/workflows/[id]/deactivate/ — POST (also PATCH). Auth: required. Owner-only; deactivates workflow. AGENT NOTE: PATCH is aliased to POST for client compatibility.
src/app/api/v2/crm/custom-fields/reorder/ — POST. Auth: required. Reorders custom fields.
src/app/api/v2/crm/webhooks/ — GET, POST. Auth: required. Outgoing webhooks. AGENT NOTE: CRM mutation routes emit events (create/update with changes diff, delete, deal stage/won/lost, task complete, bulk tag capped 50) that fan out to legacy workflows, outgoing webhooks, and the unified dispatcher via src/lib/crm/event-handlers.ts.

## Agent Routes

src/app/api/v2/agent/missions/ — GET (list, filterable by brand/search/status), POST (create mission). Auth: required.
src/app/api/v2/agent/missions/[id]/ — GET (mission + events + links), PUT (update title/summary/status/mode), DELETE. Auth: required.
src/app/api/v2/agent/missions/[id]/kill/ — POST. Auth: required. Stops a running mission.
src/app/api/v2/agent/missions/[id]/events/ — GET (SSE stream of mission events), POST (append event). Auth: required.
src/app/api/v2/agent/missions/[id]/context/ — GET. Auth: required. Mission context payload.
src/app/api/v2/agent/missions/[id]/links/ — GET, POST. Auth: required. Mission resource links.
src/app/api/v2/agent/approvals/ — GET (pending HITL approval queue). Auth: required.
src/app/api/v2/agent/approvals/[id]/approve/ — POST. Auth: required.
src/app/api/v2/agent/approvals/[id]/reject/ — POST. Auth: required.
src/app/api/v2/agent/approvals/[id]/delegate/ — POST. Auth: required.
src/app/api/v2/agent/strategies/ — GET, POST. Auth: required. Agent strategies.
src/app/api/v2/agent/strategies/[id]/ — GET, POST. Auth: required.
src/app/api/v2/agent/recurring-missions/ — GET, POST. Auth: required. Recurring mission configs.
src/app/api/v2/agent/recurring-missions/[id]/ — PATCH, DELETE. Auth: required.
src/app/api/v2/agent/mission-triggers/ — GET, POST. Auth: required. Event-driven mission triggers.
src/app/api/v2/agent/mission-triggers/[id]/ — PATCH, DELETE. Auth: required.
src/app/api/v2/agent/scheduled-tasks/ — GET, POST. Auth: required. Scheduled mission executions.
src/app/api/v2/agent/scheduled-tasks/[id]/ — PATCH, DELETE. Auth: required.
src/app/api/v2/agent/plan-gate/ — GET. Auth: required. Agent plan-gating status.
src/app/api/v2/agent/agency/ — GET. Auth: required. Agency-mode config.
src/app/api/v2/agent/analytics/ — GET. Auth: required. Agent usage analytics.
src/app/api/v2/agent/tools/ — GET. Auth: required. Available agent tool registry.
src/app/api/v2/agent/control-channel/ — GET (current WhatsApp control-channel binding status for the session user), POST (start PAIR-code pairing; body { phone, brandId? } → { code, whatsappNumber, expiresAt }), DELETE (revoke the binding). Auth: required; organizationId resolved from the session user's DB record, never the body. AGENT NOTE: the returned code is displayed in the web UI — the user texts "PAIR <code>" to the brand's WhatsApp number, and activation happens in the WhatsApp webhook divert (src/app/api/webhooks/whatsapp/route.ts) BEFORE any CRM/bot processing, so control traffic never creates CRM records or reaches bots. AGENT SEE: docs/api/database.md — agent_control_bindings.

AGENT NOTE: a user message to POST /api/agent/chat on an existing mission now stamps a fresh sessionStartedAt (new wall-clock session) and clears terminatedReason — so a mission previously blocked by budget/wall-clock revives on the next message (src/lib/agent/agent-chat-route.ts).

AGENT SEE: docs/api/database.md — agent system models (agent_missions, strategy, mission-trigger, approval-request, agent_control_bindings, etc.)

AGENT SEE: docs/api/route-handlers-part2.md — continues here (Social, Documents, Notifications, Voice, AI Bots, Admin, Infrastructure)
