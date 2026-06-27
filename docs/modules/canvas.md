# Canvas Module

> Scope: AI Canvas workflow editor — node graph, execution, real-time feedback.
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-05

## Overview

AI Canvas is a ReactFlow v11-based visual workflow editor. Users build node graphs that the unified execution engine processes. Nodes cover AI generation, social publishing, CRM actions, WhatsApp messaging, data scraping, HTTP requests, and control flow (conditions, loops, delays). Execution feedback is pushed in real-time via Socket.io events bridged over Redis pub/sub.

## Entry Points

- src/app/(app)/canvas/page.tsx — Canvas list page. Lists all user canvases.
- src/app/(app)/canvas/[id]/page.tsx — Individual canvas editor. Full-screen ReactFlow editor.
- src/app/(app)/canvas/templates/ — Template gallery.
- src/app/api/v2/canvases/ — REST API for canvas CRUD.
- src/app/api/v2/canvases/[id]/execute/ — POST triggers execution; returns SSE stream.
- src/app/api/v2/canvas-templates/ — Template management API.
- src/app/api/v2/canvas-webhooks/ — Inbound webhooks that trigger canvas execution.

## Key Components

src/components/canvas/canvas-toolbar.tsx — Top toolbar: run button, save, share, zoom controls, AI generate button.

src/components/nodes/node-shell.tsx — Base shell for all nodes. Provides: full-width .drag-handle header, 3px left accent border (CATEGORY_THEME color), control plane buttons (run, duplicate, disable, lock, settings, delete). ReactFlow v11 requires dragHandle to be set per-node in the node data, not globally.

src/components/nodes/node-handle.tsx — 14px unified connection handle. Color matches category accent.

src/components/nodes/node-categories.ts — CATEGORY_THEME map: 6 categories (input, ai, logic, action, output, utility) each with an accent color.

src/components/canvas/radial-menu.tsx — Context menu as floating frosted-glass buttons fanning out from a center point. Context-aware center action (Plus/Settings/Trash). Appears on drag-to-empty space or right-click.

src/components/edges/custom-edge.tsx — Smooth step edges with borderRadius: 12 and a hover glow layer.

AGENT NOTE: Node components (node-shell, node-handle, node-categories) live in src/components/nodes/ and edge components in src/components/edges/ — NOT under src/components/canvas/. Only canvas chrome (toolbar, radial-menu, execution-control, sidebars, dialogs) lives in src/components/canvas/.

src/components/canvas/execution-control.tsx — Execution progress panel showing status, elapsed time, and step count.

src/components/canvas/node-execution-indicator.tsx — Per-node status overlay (running spinner, success check, failure x).

src/components/canvas/node-config-sidebar.tsx — Right sidebar for editing selected node configuration.

src/components/canvas/quick-node-search.tsx — Command-palette-style node picker triggered from the radial menu.

src/components/canvas/dialogs/ai-workflow-dialog.tsx — AI-assisted workflow generation dialog. Calls /api/v2/ai-workflow/generate as a Server-Sent Events stream.

## Data Model

Canvas stored in MongoDB canvases collection via canvas.model.ts:
- userId: string (NOT ObjectId — plain string match)
- organizationId: string, optional, backfilled lazily
- name: string
- data: JSON string. Must be parsed as JSON to access { nodes: [], edges: [] }. Never store nodes/edges as separate fields.

AGENT AVOID: Accessing canvas.data.nodes directly. Always parse: const { nodes, edges } = JSON.parse(canvas.data).
AGENT AVOID: Treating canvas.userId as an ObjectId. It is a plain string and must be compared with === not ObjectId equality.

## Execution Flow

1. User clicks Run on the canvas toolbar.
2. canvas-toolbar.tsx POSTs to /api/v2/canvases/[id]/execute.
3. Route handler creates a UnifiedWorkflowExecution record.
4. For short workflows: unified-execution-engine.ts runs inline.
5. For long workflows: job enqueued to BullMQ execution queue.
6. Engine processes nodes via NodeProcessorRegistry.execute(context).
7. On each step, publishWorkflowEventAsync emits to Redis workflow:events channel.
8. Socket.io server (server.js) re-emits the event to the workflow:<id> room.
9. use-socket.ts in the canvas page receives the event.
10. ExecutionContext (src/contexts/execution-context.tsx) updates node status.
11. NodeExecutionIndicator renders the per-node status overlay.

AGENT SEE: docs/architecture/data-flow.md — Detailed workflow execution path.

## Canvas → UnifiedWorkflow Sync

Canvases are the editing surface; the engine runs UnifiedWorkflow documents. src/lib/workflow/canvas-sync.ts is the single bridge that materializes a canvas into its UnifiedWorkflow shadow (matched on canvasId). syncCanvasWorkflow now runs on SAVE as well as on execute — so event/webhook/cron-triggered canvases go live without a manual first run.

The workflow trigger is derived from the canvas's first trigger node (deriveTriggerFromCanvasNodes): trigger.type and trigger.config come from that node, refreshed on every sync. Legacy canvas-engine subTypes are aliased onto the model enum: schedule → scheduled, whatsapp_message → message_received. A canvas with no trigger node falls back to { type: 'manual', config: {} }. When the derived trigger is scheduled and the workflow is active, the sync (re)registers its repeatable BullMQ job via registerScheduledWorkflow.

AGENT NOTE: Previously materialization lived inline in the execute route and hardcoded trigger { type: 'manual' }, so event-driven canvases never fired. Trigger derivation now happens in canvas-sync.ts — do not reintroduce a hardcoded 'manual' trigger in the execute path.

## Trigger Dispatch and Guards

One inbound event fans out to N matching workflow executions through src/lib/workflow/triggers/dispatch.ts (dispatchTrigger). It matches active UnifiedWorkflows by organizationId + trigger.type, applies per-kind config filters, and enqueues one execution per match. CRM mutation events enter via dispatchCrm.

Run-limit guards (runOnce, maxExecutions, cooldownMinutes) are enforced at the shared enqueue choke point (enqueueForAll) so they apply to ALL trigger kinds, not just CRM. On each successful enqueue, lastTriggeredAt is stamped (best-effort) so the cooldown guard works on the next event.

## Manual Runs on CRM Records

Manual-trigger CRM workflows can be run on demand against selected records:
- GET /api/v2/crm/automations — lists active manual-trigger workflows in the org for a given entityType + availability (single | bulk | both), surfaced as record/selection actions in CRM lists.
- POST /api/v2/crm/automations/run — fans out one execution per selected record (deduped, capped at 100, source 'manual-crm'). Records not found in the org are skipped. Gated by assertCanManageSettings.

## Node Processor Map

NodeProcessorRegistry (src/lib/workflow/node-processors/index.ts) maps subType strings to processor classes. Key categories: whatsapp, crm, marketing-email, ai, data (scrapers), actions (telegram, email, instagram-dm), integration (http, webhook, notion, google-workspace, plus the integrations-hub providers below), social, logic (smart-router, sub-workflow), data-input (passthrough).

Integrations-hub nodes (integration_mailchimp, integration_hubspot, integration_airtable, integration_zoho, integration_webflow, integration_blogger, integration_wordpress, integration_apollo, integration_semrush, integration_revenuecat, integration_n8n, integration_shopify) share one generic canvas component: src/components/nodes/integration-hub-node.tsx, registered under twelve ReactFlow node types (mailchimpNode, hubspotNode, airtableNode, zohoNode, webflowNode, bloggerNode, wordpressNode, apolloNode, semrushNode, revenuecatNode, n8nNode, shopifyNode) that all point at the same component — the node type selects the provider config (action list + per-action fields). The execution engine resolves integration node subTypes by trying integration_{subType} first, so the taxonomy and canvas mapping use the short name (e.g. mailchimp). Credentials resolve server-side at execution via src/lib/integrations/server/processor-credentials.ts (workflow credential vault, then explicit connectionId, then the connection's brand-to-org chain) — node data never holds secrets.

AGENT SEE: docs/api/external-services.md — Integrations Hub provider catalog.

### CRM trigger nodes
Eleven CRM trigger subTypes (category trigger): record_created, record_updated, record_deleted, field_changed, stage_changed, deal_won, deal_lost, tag_added, tag_removed, task_completed, plus a Manual: CRM records trigger (registry type triggerManualCrm, subType manual) whose config carries entityType + availability. CRM mutations are routed to matching workflows by dispatchCrm in triggers/dispatch.ts; per-kind config filters (field name + from/to value for field_changed, stageId for stage_changed, tagId for tag_added/removed) narrow the match.

### CRM action nodes
Thirteen CRM action subTypes (category action), processors under src/lib/workflow/node-processors/crm/:
- create_contact / update_contact / create_deal / update_deal.
- find_record — locates a record (e.g. company by name via findByName).
- delete_record — SOFT-deletes (repository softDelete sets deletedAt → trash, 30-day purge), not a hard delete.
- add_tag / remove_tag — by tag id or name; add_tag can create the tag if missing (createIfMissing).
- assign_owner — strategy specific | round_robin | load_balanced; round_robin/load_balanced fall back to specific when no candidates are configured.
- move_stage — moves a deal stage and records stage history.
- create_task / create_activity / log_note — all three are the same CreateActivityProcessor with a fixed type (task / activity / note); create_task and log_note are sugar aliases of create_activity.

### form_input control node
src/lib/workflow/node-processors/control/form-input.ts — a human-in-the-loop pause node (category control, subType form_input). On first entry it creates a WorkflowFormRequest (status pending) assigned to a user (specific assigneeId or the workflow owner), notifies the assignee in-app, and throws ExecutionPausedForEvent({ kind: 'form_submitted', key: formRequestId }) so the engine parks the run PAUSED. The user fills the form in the /workflows/forms UI; submission (POST /workflow-forms/[id]/submit) calls resumePausedExecutionsForEvent, which resumes the run and exposes { submitted, values, formRequestId } as the node output for downstream nodes ({{$<nodeId>.values.<key>}}).

AGENT NOTE: The legacy CRM workflow engine is deprecated. POST /api/v2/crm/workflows now returns 410; existing CRM workflows are migrated to UnifiedWorkflow via scripts/migrate-crm-workflows.ts. Build new CRM automation on the canvas/UnifiedWorkflow trigger + action nodes above.

## Legacy CRM automation engine retirement plan

The CRM event bus currently DUAL-DISPATCHES every CRM mutation: src/lib/crm/event-handlers.ts fires both the legacy engine (triggerWorkflows, line 37) and the unified dispatcher (dispatchToUnified → dispatchTrigger, line 61). This is intentional — legacy crm_workflows keep running until every org's workflows are migrated and verified on the unified engine.

Migrator (already built): src/lib/workflow/migrators/crm-to-unified.ts converts each crm_workflows doc into the equivalent UnifiedWorkflow. It is idempotent (unique sparse index on migrationMetadata.{sourceSystem,sourceId} → one unified doc per legacy workflow; re-runs update in place). Entry points: convertCrmWorkflow (pure, no I/O), migrateCrmWorkflows({ dryRun, organizationId? }), revertCrmMigration({ organizationId? }). Run via scripts/migrate-crm-workflows.ts. Pure-converter coverage is tested in src/lib/workflow/migrators/crm-to-unified.test.ts.

Preconditions to flip (retire legacy dispatch):
1. All CRM workflows migrated via the migrator script (dry-run reviewed, then real run, no unresolved placeholder set_variable nodes in the report) and spot-checked on a sample.
2. Unified CRM nodes at parity — they are: 14 CRM action subTypes in the palette (create_contact, update_contact, create_deal, update_deal, add_tag, remove_tag, assign_owner, move_stage, create_activity, create_task, log_note, find_record, find_records, delete_record) plus the 11 CRM trigger subTypes documented above.

The flip:
1. Remove the legacy triggerWorkflows call from event-handlers.ts (line 37); leave dispatchToUnified as the sole CRM trigger path.
2. Keep the crm_workflows model + collection READ-ONLY for history (stop accepting writes; POST /api/v2/crm/workflows already returns 410). Do not drop the collection.

Rollback: if a migrated org misbehaves on unified, revert that org's generated docs with revertCrmMigration({ organizationId }) and (until the flip is committed) the legacy dispatch is still live, so its CRM workflows continue running with no gap.

Adding a new node type requires: (1) implementing the NodeProcessor interface with an execute() method, (2) registering it in registerDefaultProcessors(), (3) creating the node UI component (or adding a provider config to integration-hub-node.tsx for integrations-hub providers), (4) adding it to node-categories.ts, the node-registry catalog and execution map (src/lib/canvas/node-registry.ts), node-taxonomy.ts, and the pickers (quick-node-search.tsx, dialogs/node-collection-dialog.tsx).

## State Management

Canvas editor state is local ReactFlow state (nodes, edges) synchronized to the database on save (debounced or explicit save button). ExecutionContext holds runtime state (running nodes, step outputs). No global store.

AGENT UPDATE: Update this file when the canvas data model changes, when a new node processor is added, or when the execution event contract changes.

## 2026-06-06 automation builder hardening

Landed across Phases 0–2 of docs/plan/automation-builder-gap-fixes-todo-2026-06-06.md (105-finding n8n gap audit). Summary of what shipped:

- Scheduler lifecycle fix: deleting/pausing a cron canvas now unregisters its repeatable BullMQ job; boot reconcile prunes orphaned schedulers (no more crons firing for dead workflows).
- Crash/stall sweeper cron: RUNNING runs past timeout → FAILED with reason; overdue PAUSED runs re-enqueued. Leader-locked via Redis SET NX.
- Trigger idempotency: eventId-derived idempotencyKey on dispatch (Shopify/RevenueCat/canvas-webhook/channel events) collapses duplicate deliveries; per-node send dedup on resume.
- AI Agent node now calls REAL tools (read-only CRM + compliance-gated sends) with maxSteps, org/user scoped, cost-budgeted — no more prompt theater.
- Social publish node actually publishes via submitSocialPost → BullMQ → real connected account, honoring the approval flow; brand resolved from the workflow.
- All workflow AI metered via runMeteredWorkflowAI (owner from execution, not auth()) — fixes worker Unauthorized, decrements credits, honors BYOK + plan gating.
- Secret redaction in execution history (logStep + HTTP response headers); variable snapshots stored as deltas.
- Per-org queue fairness: plan-driven concurrency cap + queued-depth cap + priority lanes (manual jumps bulk); fan-out chunked. Plan fields editable in super-admin panel.
- Quota gate moved into enqueueExecution (all entry paths), fails CLOSED.
- Execution retention pruning: plan-driven retention windows, daily prune cron, per-step output size cap.
- find_records node + "run once per item" iteration with isolated per-iteration variable scope.
- Bulk/segment mode on Send Marketing Email (single | list).
- Per-node error handling: onError stop|continue|errorPath + reserved error sourceHandle; retry delay + jitter + per-step retryCount.
- CRM palette: 14 CRM action nodes + 11 trigger nodes surfaced with config forms; broken/unbuilt taxonomy entries fixed or removed.
- WhatsApp: org+brand account selection, hard compliance gates (24h window / template approval / consent), template components (header/button/media/currency) + interactive button/list/location nodes.
- Triggers: form_submission, email_received (+ resume), ads (insights/budget-threshold/anomaly/weekly), and a polling-trigger framework (Gmail new-email, Sheets new-row, RSS).
- Execution visibility: mounted per-step viewer, on-canvas failed-node highlighting, REAL server-side stop (AbortController into fetch + AI), persisted errorNodeId.
- Test loop: pinned sample data on triggers, "Test this step", dry-run mode for send nodes.
- Canvas version history (snapshot + restore, org-scoped).
- Org/brand-level variables (real GLOBAL scope) + expression refs by visible node label.
- Transform node set: Edit Fields, Deduplicate, Merge, Sort, Aggregate/Group, Date/Time math.
- HTTP node upgrade: retry/backoff, pagination helper, credential-vault auth picker, response-format/redirect controls.
- New integration nodes: SMS (Twilio), Slack, Gmail/Sheets (promoted from google_workspace, + Sheets update/upsert/lookup), Stripe node+trigger, Calendly trigger; Shopify gained read webhook topics (carts/checkouts/orders-paid).
- Integration resilience: shared retry-with-backoff + 429/Retry-After wrapper; credential auto-pause + reconnect notification after N auth failures.
- Delay node: absolute date / wait-until-weekday+time / business-hours modes.

AGENT SEE: docs/plan/automation-builder-gap-fixes-todo-2026-06-06.md — per-item detail, acceptance criteria, and the 2026-06-06 decisions log.

## Related Docs

- docs/architecture/data-flow.md — Execution and event flow
- docs/state/client-state.md — ExecutionContext and use-socket.ts
- docs/api/route-handlers-part1.md — Canvas API routes
