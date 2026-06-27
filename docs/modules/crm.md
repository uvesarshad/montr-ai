# CRM Module

> Scope: Full-featured CRM — contacts, companies, deals, activities, and automation.
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-05

## Overview

The CRM module is inspired by Twenty CRM and provides contacts, companies, deals, pipelines, activities, tags, views, favorites, comments, attachments, email sync, calendar sync, workflow automation, outgoing webhooks, and audit logging. All data is strictly scoped to organizationId. The module is complete at the model and API layer; UI is largely built with ongoing polish.

AGENT NOTE: Every CRM repository query must include organizationId in its filter. organizationId comes from the session user's DB record, never from client input.

## Entry Points

Pages: src/app/(app)/crm/ (dashboard), contacts/, companies/, deals/, activities/, calendar/, emails/, settings/, trash/, duplicates/, reports/, settings/dedupe/, settings/record-layouts/, settings/roles/.
API routes: src/app/api/v2/crm/ — see docs/api/route-handlers-part1.md for the full route list.

## Key Components

src/components/crm/shared/crm-data-grid.tsx — TanStack Table grid with mobileCard prop for responsive card list on mobile. Used by contacts, companies, and deals list pages.

src/components/crm/shared/crm-sidebar-nav.tsx — Module sub-navigation.

src/components/crm/contacts/contact-detail.tsx — Contact detail panel with activity timeline, linked emails, and deals.

src/components/crm/contacts/contact-form.tsx — React Hook Form + Zod (src/validations/crm/contact.schema.ts). Shared for create and edit.

src/components/crm/deals/deal-kanban.tsx — @dnd-kit-based kanban board. Columns map to pipeline stages. Drop calls PATCH /api/v2/crm/deals/[id] to update stage.

src/components/crm/activities/activity-timeline.tsx — Chronological activity list. Supports types: note, task, call, meeting, email, message.

src/components/crm/notes/rich-text-editor.tsx — TipTap editor for rich notes. Content stored as JSON; plain text extracted for search via note-viewer.tsx.

## Key Hooks (src/hooks/crm/)

use-contacts.ts, use-contact.ts — list and single contact data fetching.
use-companies.ts, use-company.ts — company data.
use-deals.ts, use-deal.ts — deal list and kanban data.
use-pipelines.ts — pipeline and embedded stage data.
use-activities.ts — timeline entries.
use-tags.ts, use-views.ts, use-favorites.ts, use-comments.ts, use-attachments.ts — feature hooks.
use-crm-keyboard.ts — keyboard shortcuts: / focuses search, n opens new record, Alt+c/o/d/a navigates sections.
use-crm-stats.ts — dashboard metrics.

## Database Models (src/lib/db/models/crm/)

26 models with crm_ collection prefix. All have organizationId (required, indexed). Key models:
- contact.model.ts — IContact. Fields: firstName, lastName, email, phone, companyId, ownerId, status, tags, customFields, notes. Multi-value identities: emails[] and phones[] subdocs (value/label/primary); the primary entry mirrors to the scalar email/phone/phoneNormalized fields for back-compat. Soft-delete fields: deletedAt, deletedById.
- company.model.ts — ICompany. Fields: name, domain, industry, ownerId, tags. Soft-delete fields: deletedAt, deletedById.
- deal.model.ts — IDeal. Fields: title, pipelineId, stageId, value, currency, ownerId, contactId, companyId, closeDate. Soft-delete fields: deletedAt, deletedById.
- pipeline.model.ts — IPipeline. Fields: name, stages (embedded array: stageId, name, order, probability).
- activity.model.ts — IActivity. Fields: type (note/task/call/meeting/email/message), body, dueDate, contactId, dealId, ownerId (assignedTo for ownership scoping), isCompleted. Soft-delete fields: deletedAt, deletedById.
- audit-log.model.ts — IAuditLog. Append-only change tracking: entityType, entityId, action, changedFields, performedBy.
- view.model.ts — IView. Saved filter configurations. Fields: filterTree (nested AND/OR group tree), groupBy, openRecordIn ('panel' | 'page').
- role.model.ts — ICrmRole. CRM RBAC role (collection crm_roles). Per-entity ICrmObjectPermission (read/update/delete scope 'all'|'own'|'none', create/export booleans) for contact/company/deal/activity, plus canManageSettings. isSystem flags seeded roles. DEFAULT_CRM_ROLES seeds Admin, Member, Read only. AGENT NOTE: User.crmRoleId links a user to a CRM role; platform admins (role admin/super_admin) and users with no crmRoleId bypass all CRM permission checks (back-compat).
- dedupe-rule.model.ts — declarative duplicate-detection rules per entity (collection crm_dedupe_rules).
- record-link.model.ts — generic any↔any links between contact/company/deal records (collection crm_record_links); unique index per source/target/linkType.
- blocklist.model.ts — blocked senders/domains for email auto-create (collection crm_blocklists).
- record-layout.model.ts — per-entity detail/form field layouts (collection crm_record_layouts).
- crm-dashboard.model.ts — per-user CRM overview dashboard widget order/visibility. Widget catalog (11 widgets incl. forecast) lives in src/components/crm/dashboard/widget-catalog.ts.
- workflow.model.ts (CRM) — legacy CRM-specific automation (different from unified-workflow.model.ts). DEPRECATED — see Recent Changes.

AGENT SEE: docs/api/database.md — Full model field inventory.

## Repositories (src/lib/db/repository/crm/)

Each model has a corresponding repository. Repositories call connectDB() and scope all queries by organizationId. Pattern: contactRepository.findMany({ organizationId, ...filters }).

## Validation (src/validations/crm/)

Zod schemas for all create and update operations. Each schema validates required fields, max lengths, and field types. Used in route handlers and React Hook Form resolvers.

## Multi-Tenancy Enforcement

Route handler reads session via auth(), fetches the user to get organizationId, passes it to repository. The repository never accepts organizationId from the request body. Plan limits (maxContacts, maxDeals, etc.) are checked via src/lib/plan-enforcement.ts before writes.

## Email and Calendar Sync

Email sync: src/lib/crm/email-sync/. Connects Gmail, Outlook (OAuth), and IMAP accounts. Synced emails stored in crm_emails, auto-linked to contacts by email address. EmailAccount has autoCreateContacts / autoCreateCompanies flags; src/lib/crm/email-sync/contact-auto-create.ts auto-creates contacts from inbound senders with noise guards (skips noreply/role/system local-parts), is dedupe-aware (consults src/lib/crm/dedupe.ts), and skips company derivation for free/consumer providers (FREE_EMAIL_PROVIDERS). Blocked senders/domains (crm_blocklists) are honored; block-sender actions live in the email detail UI.

Calendar sync: src/lib/crm/calendar-sync/. Connects Google Calendar and Outlook Calendar. Events stored in crm_calendar_events.

Both sync operations are triggered on-demand (POST /api/v2/crm/email-accounts/[id]/sync) or scheduled.

AGENT NOTE: contactRepository.findByEmail takes arguments in the order (email, organizationId). All five email/calendar sync drivers (email-sync/gmail.ts, email-sync/outlook.ts, email-sync/imap.ts, email-sync/contact-auto-create.ts, calendar-sync/google-calendar.ts, calendar-sync/outlook-calendar.ts) call it with this order — a previously reversed-args bug had silently broken contact auto-linking.

## Webhook Delivery

src/lib/crm/webhook-delivery.ts — Sends HTTP POST to configured endpoints on CRM events. Uses HMAC-SHA256 signature in X-MontrAI-Signature header. Retries on failure (exponential backoff).

## Soft Delete and Trash

Contacts, companies, deals, and activities are soft-deleted: DELETE marks deletedAt/deletedById and the record moves to trash (emits a delete event + writes an audit log). Permanent hard delete requires ?permanent=true and a platform admin (role admin/super_admin). Restore via POST /api/v2/crm/{contacts,companies,deals}/[id]/restore. The /crm/trash page lists trashed records (GET /api/v2/crm/trash) and supports empty-trash (POST /api/v2/crm/trash/empty). A daily BullMQ cron (crm-trash-purge, 3 AM — registered in src/lib/queue/queue.ts) hard-deletes records older than the 30-day retention window via src/lib/crm/trash-purge.ts.

## Dedupe and Duplicate Detection

src/lib/crm/dedupe.ts — declarative duplicate detection driven by crm_dedupe_rules. Create routes call findDuplicatesForCandidate and return 409 with { error: 'duplicate_suspected', duplicates } unless overridden by ?force=true or body ignoreDuplicates: true. Import commit consults the same rules. Managed via GET/PUT /api/v2/crm/dedupe-rules (/crm/settings/dedupe page); suspected duplicates listed via GET /api/v2/crm/duplicates (/crm/duplicates page).

## Record Links

src/lib/db/models/crm/record-link.model.ts — generic any↔any links between contact/company/deal records. Managed via POST/GET /api/v2/crm/links and DELETE /api/v2/crm/links/[id]. A RelatedRecords card renders on detail sidebars.

## RBAC (CRM Permissions)

src/lib/crm/permissions.ts is the single enforcement layer for all /api/v2/crm handlers. getCrmPermissionContext resolves the session user's crmRoleId to an ICrmRole; assertCrmPermission(ctx, entity, action) returns a scope ('all' | 'own') and throws CrmPermissionError(403) on denial; assertCanManageSettings gates settings/automation routes; assertBulkCrmPermission rejects 'own'-scope users on bulk endpoints. Own-scope reads/lists add an owner filter (ownerId, or assignedTo for activities); own-scope single-record mutations verify ownsRecord; exports are export-gated. Roles are managed via /api/v2/crm/roles (CRUD), /api/v2/crm/roles/assign, and /api/v2/crm/members; the /crm/settings/roles UI fronts them. Admin/Member/Read-only roles are lazy-seeded (DEFAULT_CRM_ROLES). AGENT NOTE: platform admins (role admin/super_admin) and users with no crmRoleId bypass all checks (scope 'all') for back-compat.

## Reports and Forecasting

GET /api/v2/crm/stats/forecast — sales forecast bucketed into future periods (month/quarter, horizon up to 8) with committed (won by actualCloseDate), weighted (open × stage probability by expectedCloseDate), bestCase, per-owner breakdown, and an overdue slip bucket; optional pipelineId/ownerId filters. GET /api/v2/crm/stats/stage-conversion — stage conversion via the history-advance method. Surfaced on the /crm/reports page.

## Automation Surfaces

CRM events are emitted from every mutation route (create/update with a changes diff, delete, deal stage/won/lost, task complete, bulk tag capped at 50) via src/lib/crm/event-handlers.ts. Each event fans out to legacy CRM workflows, outgoing webhooks, and the unified-workflow dispatcher (dispatchToUnified). Records can be run through unified workflows on demand: GET /api/v2/crm/automations lists manual-trigger workflows; POST /api/v2/crm/automations/run enqueues manual runs against ≤100 records (source 'manual-crm', per-org execute rate-limited, settings-gated). A RunAutomationMenu sits on detail headers and bulk toolbars.

AGENT NOTE: Legacy CRM workflows (workflow.model.ts / /api/v2/crm/workflows) are DEPRECATED. POST /api/v2/crm/workflows returns 410; GET responses carry deprecated: true. Migration: scripts/migrate-crm-workflows.ts. New automation should target unified workflows (src/lib/db/models/unified-workflow.model.ts).

## Audit Logging

src/lib/crm/audit.ts — logAuditEvent helper. Called from route handlers after successful write operations. Writes to crm_audit_logs collection asynchronously (does not block response).

AGENT UPDATE: Update this file when a new CRM model is added, when a new feature (email sync, calendar sync, webhook) changes its API, or when the keyboard shortcuts change.

## Recent Changes

- 2026-06-05 — CRM-vs-Twenty initiative shipped: soft delete + trash (deletedAt/deletedById, restore routes, daily 30-day purge cron); multi-value contact identities (emails[]/phones[] with primary→scalar mirror via src/lib/crm/contact-identity.ts + backfill script scripts/backfill-contact-identities.ts); declarative dedupe (crm_dedupe_rules, 409 duplicate_suspected); generic record links (crm_record_links); email contact auto-create (EmailAccount autoCreate flags, noise/free-provider guards, blocklist) + fixed reversed findByEmail args in all 5 email/calendar sync drivers; View openRecordIn/filterTree/groupBy + record kanban/calendar/preview-panel/layouts/per-user dashboard; forecast + stage-conversion reports; CRM RBAC (crm_roles, User.crmRoleId, src/lib/crm/permissions.ts enforced in all handlers); in-CRM automation surfaces (manual unified-workflow runs, CRM events → unified dispatcher) and DEPRECATION of legacy CRM workflows (POST 410). New models: role, dedupe-rule, record-link, blocklist, record-layout, crm-dashboard.

## Related Docs

- docs/api/route-handlers-part1.md — Full CRM route list
- docs/api/database.md — CRM model details
- docs/auth/authorization.md — organizationId enforcement pattern
