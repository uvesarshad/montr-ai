# Agent Module

> Scope: Autonomous Agent workspace — missions, tools, HITL, scheduling, and multi-agent.
> Rendering context: Client-side (shell) / Server-side (API and execution)
> Project tier: 4
> Last updated: 2026-06-06

## Overview

The Agent module provides an autonomous AI workspace where users create Missions — goal-oriented tasks the AI executes using a registered tool set. Missions have configurable limits (tool calls, tokens, credits, wall-clock time) and five execution modes. Human-in-the-loop (HITL) gates let users approve, reject, or delegate tool actions before execution. A strategy pipeline generates versioned plans and decomposes them into ordered roadmaps that instantiate as missions. Missions can be scheduled via cron, triggered by platform events, and linked to other platform resources.

## Entry Points

- src/app/(app)/agent/page.tsx — Agent workspace (server component wrapper → AgentShell).
- src/app/(app)/agent/approvals/page.tsx — Approval queue with bulk decide and delegation UI.
- src/app/(app)/agent/scheduled/page.tsx — Scheduled and recurring mission list.
- src/app/(app)/agent/analytics/page.tsx — Token spend, cache hit rate, mission analytics.
- src/app/(app)/agent/agency/page.tsx — Cross-brand read-only aggregate dashboard (org must have ≥ 2 brands).
- src/app/(app)/agent/missions/[id]/page.tsx — Mission detail with live event timeline.
- src/app/(app)/agent/settings/page.tsx — Per-brand autonomy mode, model picker, tool whitelist, recurring missions, event triggers.
- src/app/(app)/agent/strategies/page.tsx — Strategy list with versioning and status (draft/active/archived); create and regenerate strategies per brand.
- src/app/(app)/agent/tools/page.tsx — Read-only tool catalog browser; lists each registered tool with its name, description, HITL policy, and scope.
- src/components/agent/agent-launcher.tsx — Floating launcher button on all authenticated pages.
- src/app/api/agent/chat/route.ts — Chat turn endpoint (POST); delegates to handleAgentChatRequest, which streams the response over HTTP/SSE.
- src/app/api/v2/agent/ — Mission CRUD, approvals, scheduled tasks, triggers, strategies, and the mission events endpoint.

## Key Components

src/components/agent/agent-shell.tsx — Main agent workspace UI. Mission list, active mission chat, and HITL approval panel. Client Component.

src/components/agent/agent-launcher.tsx — Floating bottom-right button. Opens mission creation dialog.

## Key Library Files (src/lib/agent/)

See `src/lib/agent/README.md` for the full developer reference including HITL resolution order, gate-decision logic, multi-agent routing internals, and testing notes.

**missions.ts** — Core mission CRUD: `createMission`, `getMission`, `updateMission`, `killMission`.

**agent-chat-route.ts** — Drives one AI conversation turn. Calls `generateTextWithClient` with tool definitions from the tool registry. Tracks usage against mission limits.

**tool-registry.ts** — Central registry of all tools. Each tool has a name, description, Zod input schema, declared `hitlPolicy`, and a `factory` function.

**hitl-gateway.ts** — Intercepts tool calls through a five-layer priority chain (exemptions → brand overrides → tool policy → danger list → mode). Exports `checkHITL`, `approveAction`, `rejectAction`, `delegateAction`, `getPendingActions`, and the pure `resolveGateDecision` helper.

**mission-budget.ts** — `checkAndIncrement` atomically increments usage only when within limit; `checkWallClock` checks elapsed time. Auto-pilot fallback: when usage reaches ≥ 90% of any cap, flips `autopilot` → `mixed`.

**compaction-engine.ts** — Summarises the event log when the context window fills. Compact summary injected as first system message on subsequent turns.

**mission-context.ts** — Builds the system prompt from mission record + brand context.

**mission-templates.ts** — Reusable mission configurations. Templates declare `onComplete` chains and `recurring` cron expressions.

**mission-lifecycle.ts** — Terminal transition helpers (complete, block, kill).

**scheduled-task-runner.ts** — Fires missions on cron schedule from `agent_scheduled_tasks`.

**mission-trigger-service.ts** — Listens to the domain event bus and auto-starts missions on matching platform events.

**plan-gate.ts** — Plan-tier enforcement (allowed modes, allowed models, budget caps).

**multi-agent/** — Agent coordinator (LLM router + keyword fallback), agent catalog with role gating, and session manager.

## Data Models

**agent_missions** — Status lifecycle: `draft → active → waiting → scheduled → blocked → completed`. Mode: `watch | supervised | mixed | autopilot | autonomous | approval-first`. Limits: `maxToolCalls` (100), `maxTokens` (500 K), `maxWallClockMs` (30 min), `maxCredits` (1000), `maxRetriesPerTool` (3). Usage counters updated atomically.

**agent_mission_events** — Append-only event log. Types: `message`, `tool_call`, `tool_result`, `approval_request`, `status_change`, `artifact_created`, `error`. Consumed by the mission detail page to render the timeline.

**agent_mission_links** — Resource links when a mission produces platform artifacts (canvas, document, contact, etc.).

**pending_agent_actions** — HITL queue. Fields: `missionId`, `toolName`, `toolArgs`, `toolDescription`, `status` (pending/approved/rejected/expired), `expiresAt`, `delegatedTo`, `delegatedBy`, `delegatedAt`. When a pending action exists the mission flips to `waiting`.

**agent_scheduled_tasks** — Cron-scheduled missions. Fields: `missionId`, `cronExpression`, `nextRunAt`, `lastRunAt`.

**strategies** — Versioned strategy entities. Fields: `orgId`, `brandId`, `name`, `goals[]`, `channels[]`, `contentMix`, `cadence`, `status` (draft/active/archived), `version`, `parentStrategyId`.

**strategy_roadmaps** — Ordered mission template sequences linked to a strategy. Each entry: `templateId`, `order`, `dependsOn[]`, `scheduledFor`, `missionId?`.

## Execution Modes

`AgentMissionMode` (agent_missions `mode` field, default `mixed`) has five values:

| Mode | Behaviour |
|---|---|
| `watch` | Every tool call requires approval before execution |
| `mixed` | HITL only for tools in the brand's `requireApproval` list |
| `autopilot` | Runs autonomously; danger-list tools still gate; flips to `mixed` at 90% cap |
| `approval-first` | Gates all tool calls (same effect as `watch`) |
| `autonomous` | Runs without HITL except for `hitlPolicy: 'always'` tools |

Allowed modes per brand are gated by plan tier (`IPlanFeatures.agent.allowedAutonomyModes`). Free plan locks to `watch`.

AGENT NOTE: the plan-gate `AutonomyMode` enum (`watch | supervised | autopilot` in src/lib/agent/plan-gate.ts) is a SEPARATE enum from `AgentMissionMode` (`mixed | approval-first | autonomous | watch | autopilot` in src/lib/db/models/agent-mission.model.ts). Plan gating uses the AutonomyMode set; persisted missions use the AgentMissionMode set. `supervised` exists only in plan-gate; `mixed`, `approval-first`, and `autonomous` exist only on the mission record.

## Execution Flow

1. User creates or resumes a mission via AgentShell.
2. User message sent to `POST /api/agent/chat` (with `missionId` in the body; the route creates a mission when none is supplied).
3. `agent-chat-route.ts` calls `generateTextWithClient` with tool definitions filtered by agent and plan.
4. AI model returns text or a tool call.
5. Tool call hits `checkHITL`:
   - **Not gated** → tool executes; result appended to events; conversation continues.
   - **Gated** → `pending_agent_actions` record created; mission flips to `waiting`. The turn is delivered to the client over the chat HTTP/SSE stream; the client reads the mission timeline by polling the events endpoint (GET src/app/api/v2/agent/missions/[id]/events/route.ts).
6. User approves / rejects / delegates via `/api/v2/agent/approvals/[id]`.
7. On approval: tool executes; mission flips back to `active`; auto-continue runner dispatches next turn (autonomous mode).
8. `mission-budget.ts` checks limits after each turn. On exhaustion → mission terminates with a typed reason code.
9. Compaction runs when token count approaches the model's context window.

## HITL Priority Chain

Resolution order (highest first):

1. **Exemptions** — mission-control tools (`createPlan`, `setPlanStep`, `completeMission`, `reportBlocked`) and all read-only tools: never gated.
2. **Brand override** — `context.hitlOverrides[toolName]` (set in agent settings per brand).
3. **Tool policy** — `registeredTool.hitlPolicy` declared at registration.
4. **Danger list** — `ALWAYS_REQUIRE_APPROVAL` set in `hitl-gateway.ts` (WhatsApp sends, voice calls, campaign sends, destructive CRM ops).
5. **Mission mode** — `watch`/`approval-first` gates all; `autopilot`/`autonomous` passes all; `mixed` gates the brand list.

## Strategy → Roadmap → Mission Pipeline

```
generateStrategy(brandId, goal)   →  Strategy (versioned, prompt-cached brand context)
        ↓
decomposeStrategy(strategyId)     →  StrategyRoadmap (ordered templates + dependsOn)
        ↓
instantiateRoadmap(roadmapId)     →  AgentMission records (scheduled, dep-ordered)
        ↓
[missions execute + analytics]
        ↓
iterateStrategy(strategyId, data) →  new Strategy version (updated cadence/channels)
```

Brand context (voice, audience, industry, competitors) is read automatically and sent as a prompt-cached block, saving token cost across regenerations and iterations.

## Multi-Agent Routing

User messages are classified by `multi-agent/agent-coordinator.ts`:

1. **Explicit mention** — `@crm`, `@social`, `@recruit`, `@strategy`, `@inbox`, etc. detected by `detectExplicitAgentRequest`.
2. **LLM router** (primary) — `routeToAgentWithLLM` calls the plan's `routerModel` (default: Haiku 4.5). Returns `needsDisambiguation: true` when confidence < 0.6.
3. **Keyword fallback** — `routeToAgent` scores agents by summing matched keyword lengths; longer = more specific.

Agents: `crm-agent`, `social-agent`, `knowledge-agent`, `marketing-agent`, `recruitment-agent`, `content-factory-agent`, `inbox-agent`, `strategy-agent`, `ops-agent`, `voice-agent`, `general-agent`. (`automation-agent` was folded into `ops-agent` on 2026-06-05; `@automation` mentions still route to ops-agent.)

## Approval Delegation

Any pending action can be delegated to another user via `POST /api/v2/agent/approvals/[id]/delegate`. The delegatee sees the action in their approval queue. The action remains `pending`; the delegatee must approve or reject. All delegation decisions are written to the CRM audit log.

## Brand Scoping and Agency Mode

All agent missions are strictly brand-scoped (`organizationId` + `brandId` on every record and query). Brand A's agent cannot access Brand B's data.

For orgs with ≥ 2 brands, `/agent/agency` provides a read-only cross-brand aggregate dashboard — it does not create or execute cross-brand agents.

## Plan Features (IPlanFeatures.agent)

| Field | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| `allowAgent` | false | true | true | true |
| `allowedModels` | Haiku only | Haiku, Sonnet | Haiku, Sonnet | All |
| `defaultModel` | haiku-4-5 | haiku-4-5 | sonnet-4-6 | sonnet-4-6 |
| `routerModel` | haiku-4-5 | haiku-4-5 | haiku-4-5 | haiku-4-5 |
| `maxToolCalls` | 20 | 100 | 500 | 2 000 |
| `maxTokens` | 100 K | 500 K | 2 M | 10 M |
| `maxWallClockHours` | 0.5 | 0.5 | 2 | 8 |
| `allowedAutonomyModes` | watch | watch, mixed | all | all |
| `defaultAutonomyMode` | watch | watch | mixed | autopilot |

## Cost Telemetry

Token cost and cache hit rate are tracked per mission via `mission-budget.ts`. After completion, token count and estimated cost are visible in the mission detail header strip. The analytics page (`/agent/analytics`) aggregates token spend across completed missions. Only AI inference turns (not approval events or sub-mission spawns) count against the token budget.

## Runtime invariants (2026-06-06, from the first live E2E pass)

- **Tool binding is provider-dependent.** Agent turns only execute tools on providers whose text path really binds them: anthropic, openai, google (via Gemini's OpenAI-compatible endpoint), openrouter — all through the Vercel AI SDK. client.ts logs every tool-carrying call's resolved provider and warns when a provider can't bind. A provider that drops tools makes the model ROLEPLAY tool calls — the agent will claim success with zero tool_call events; always verify against agent_mission_events.
- **Tool parameter schemas must be a plain object at the root.** Gemini rejects function declarations whose JSON schema root is anyOf/oneOf (e.g. zod discriminatedUnion as `parameters`) and one bad declaration 400s the whole request. Wrap unions inside z.object and validate the canonical schema inside execute (see create_ad_campaign).
- **Continuation jobIds are unique per enqueue.** BullMQ silently ignores add() when the jobId matches a completed job retained by removeOnComplete — a stable per-mission jobId killed the autonomous loop after one turn. Double-run protection lives in processMissionContinuation's status/mode pre-checks, not the jobId.
- **Wall-clock is per wake/interaction session.** checkWallClock measures from `sessionStartedAt ?? createdAt`; hibernation wake AND every user chat message stamp sessionStartedAt (the chat route also clears terminatedReason, so a blocked mission revives on the next message).
- **All agent queue consumers live in scripts/workflow-worker.ts** (agent-tasks 5-min cron incl. hibernation wake, mission runner, briefing/digest). PM2 prod config runs only server.js — without the worker process, autonomy does not run.
- **Plan features gate everything.** Fresh installs have `agent.allowAgent: false` and `maxActiveSchedules: 0` on every plan — agent chat 403s and self-scheduling/hibernation are off until a super admin sets values in the admin plans panel (whose Agent section persists correctly as of 2026-06-06; it silently never had before).
- Agent chat renders assistant messages as markdown (react-markdown); the composer's specialist dropdown mirrors AGENT_DEFINITIONS — update both together.

## Goal Mode, Workspace, and Long-Horizon Autonomy (2026-06-05)

**Goal Mode** (`src/lib/agent/tools/strategy-tools.ts`): a stated business goal becomes executing missions with one approval — `generate_strategy` (draft) → agent presents in chat → `activate_strategy` (hitlPolicy 'always'; the approval card is the sign-off) → `decomposeStrategy` + `instantiateRoadmap` spawn dep-ordered missions (linked via `mission.strategyId`) → `iterate_strategy` produces the next draft version (auto-gathers a 30-day cross-channel report). Owned by strategy-agent; also on marketing-agent.

**Agent Workspace** (`src/lib/agent/workspace.ts` + `tools/workspace-tools.ts`): brand-scoped folder tree in the Docs module (`Agent Workspace — <brand>/` with Strategies/Research/Drafts/Reports/Playbooks + pinned `Agent Memory` doc), identified by `referenceType 'agent_workspace[_memory]'` + `referenceId brandId`. Tools: `list_workspace_docs`, `read_doc`, `write_workspace_doc` (on every specialist). `completeMission` auto-writes a report doc; strategies are mirrored into Strategies/. Users read/edit everything in /docs.

**Self-scheduling** (`tools/schedule-tools.ts`): `create_scheduled_task` and `create_mission_trigger` (both hitlPolicy 'always') let the agent schedule future tool runs and subscribe missions to platform events; list/cancel/delete variants included. Capacity per brand = `IPlanFeatures.agent.maxActiveSchedules` (0 disables, −1 unlimited; super-admin editable in the admin plans panel).

**Long-horizon missions** (`src/lib/agent/long-horizon.ts`): `sleep_until` (mission-control exempt) hibernates a mission — status `scheduled` + `wakeAt`/`wakeReason`; the 5-minute agent-tasks cron wakes due missions (`sessionStartedAt` stamped, idleTurns reset, continuation dispatched for autonomous/autopilot, owner notified otherwise). **Wall-clock budget applies per wake-session** (`checkWallClock` measures from `sessionStartedAt ?? createdAt`). Wake cadence floored by `IPlanFeatures.agent.minWakeIntervalMinutes`.

**Daily briefing** (`src/lib/agent/briefing.ts`): 09:00 cron (notification-digest queue) — per brand with agent activity in 24 h: missions completed/blocked/active/hibernating, pending approvals, next-24 h schedules → in-app notification + workspace `Reports/` doc.

## WhatsApp Control Channel (2026-06-05)

Owners can drive their agent from WhatsApp (`src/lib/agent/control-channel.ts` + `agent_control_bindings`): pair via a 6-digit code shown in Agent ▸ Settings and texted as `PAIR <code>` to the brand's WhatsApp number (user-initiated — no Meta template needed); then `status` (mission counts + numbered approvals), `approve <n>` / `reject <n>` (scoped to the bound user; `create_ad_campaign` and `bulk_call` are app-only deep links), `goal <text>` (spawns a strategy-agent mission in `mixed` mode), `stop`. The webhook diverts bound phones BEFORE CRM/bot processing, so control traffic never creates contacts or reaches bots. Rails: sha256 code (10-min expiry, 3 attempts auto-revoke), 20 commands/hour, every command audited. Pairing API: `/api/v2/agent/control-channel` (GET/POST/DELETE).

## Ads & Analytics Tools

Read tools in `src/lib/agent/tools/ads-tools.ts`, all `hitlPolicy: 'never'` because they only READ the unified metrics store / lead records:

- `get_ads_insights` — per-campaign/account spend, impressions, clicks, conversions (Meta/Google, 1–90 day window).
- `get_marketing_analytics` — GA4 traffic + channels, Search Console totals + top queries (position correctly averaged), or account-level social metrics.
- `get_ad_leads` — captured Meta/Google leads with CRM sync status and counts.

Write path (`src/lib/agent/tools/ads-write-tools.ts`, decision D1 2026-06-05): `list_ad_accounts` (read) and `create_ad_campaign` (`hitlPolicy: 'always'` — its parameters ARE the wizard's `adsCampaignCreateSchema`, so the approval card renders the complete draft and the spec cannot drift from the API contract). On approval it routes through `createCampaignFromSpec` → the write-ops allowlist: create-only, PAUSED, audited, org+brand ownership double-checked. The approved HITL card is what satisfies the guardrail's "explicit user action"; `create_ad_campaign` approvals are app-only on the WhatsApp control channel. No update/delete/pause tool exists.

Wired into the marketing-agent and strategy-agent specialist tool lists.

## Deferred Features

- **Agent fine-tuning on brand data** — deferred; requires evaluation infrastructure (golden prompt/response pairs, automated scoring pipeline).
- **Cross-org agent marketplace** — future; shared templates visible across organisations; blocked on multi-tenant marketplace schema design.

## AGENT NOTE

Update this file when: new execution modes are added, HITL resolution order changes, new plan feature fields are added to `IPlanFeatures.agent`, or the strategy pipeline gains new stages. For internal developer details (HITL logic, routing internals, test coverage) see `src/lib/agent/README.md`.

## Related Docs

- src/lib/agent/README.md — Developer reference (HITL internals, tool registration, routing, tests)
- docs/api/database.md — agent_missions and related model schemas
- docs/api/external-services.md — AI providers used for mission execution
- docs/state/server-state.md — BullMQ for scheduled tasks
