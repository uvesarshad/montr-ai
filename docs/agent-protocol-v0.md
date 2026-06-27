# MontrAI Agent Protocol — v0

> **Status:** **v0 — DRAFT, VERSIONED, SUBJECT TO CHANGE.** This is the first public
> description of the contract MontrAI's autonomous agent exposes so that others can build on
> it. Names, shapes, enum values, and defaults documented here are accurate to the L1
> framework as it ships in the fair-code core, but **v0 makes no stability promise** — fields
> may be renamed, added, or removed before v1. Pin to a release tag; do not assume forward
> compatibility.
>
> **License note:** MontrAI is **fair-code / source-available** (n8n Sustainable Use
> License), *not* "open source." This protocol document and the L1 framework it describes are
> published as a public standard (master plan §2A, decisions **D9 / D14 / D16**). The L2 brain
> (curated playbooks, tuned models, grounding *data*), L3 data flywheel, and L4 managed runtime
> are **not** part of this contract.
>
> **What this is.** The public contract of the **L1 Frame** — the mission loop, tool registry,
> HITL gates, budgets, hibernation, and the `goal → Strategy → roadmap → AgentMission`
> lifecycle. It is the surface a third party targets to: define a custom agent, register a
> custom tool, author a mission template, or drive the agent programmatically.
>
> **What this is not.** It is not the prompts, the playbook library, the benchmark dataset, the
> tuned strategy models, the cross-tenant outcome data, or the multi-tenant fleet orchestration.
> Those are deliberately out of scope (the moat — master plan §2A).

---

## 0. Scope & grounding

This spec is grounded in the shipping code. The canonical implementations are:

| Concern | Source of truth |
|---|---|
| Mission record + states + modes + limits/usage | `src/lib/db/models/agent-mission.model.ts` |
| Strategy record (versioned) | `src/lib/db/models/strategy.model.ts` |
| Roadmap record (dependency-ordered) | `src/lib/db/models/strategy-roadmap.model.ts` |
| Strategy generation / decomposition | `src/lib/strategy/generator.ts` |
| Roadmap → missions instantiation, iteration | `src/lib/strategy/instantiate.ts` |
| Goal-Mode chat tools (`generate_strategy`, `activate_strategy`, …) | `src/lib/agent/tools/strategy-tools.ts` |
| Tool registry + execution wrapper | `src/lib/agent/tool-registry.ts` |
| Tool I/O + context types | `src/lib/agent/tools/types.ts` |
| HITL gates | `src/lib/agent/hitl-gateway.ts` |
| Budget enforcement | `src/lib/agent/mission-budget.ts` |
| Hibernation (sleep/wake) | `src/lib/agent/long-horizon.ts` |
| Mission templates | `src/lib/agent/mission-templates.ts` |
| Mission lifecycle (chaining, iteration) | `src/lib/agent/mission-lifecycle.ts` |
| Specialist agent catalog | `src/lib/agent/multi-agent/agent-definitions.ts` |
| WhatsApp control channel | `src/lib/agent/control-channel.ts` |
| Developer reference (companion) | `src/lib/agent/README.md` |

> The README in `src/lib/agent/` is the *internal developer* reference; this document is the
> *public protocol*. When they diverge, the code wins, and a v0.x revision of this file follows.

---

## 1. The lifecycle: goal → Strategy → roadmap → AgentMission

The core promise is: **a stated business goal becomes executing work with a single human
approval.** The pipeline has four artifacts and four transforms.

```
   goal (free text)
     │  generateStrategy()                 — LLM: reformulate → generate → validate → critic
     ▼
   Strategy (draft, versioned)             — KPIs, channels, content mix, cadence, validation
     │  decomposeStrategy()                — LLM: strategy → ordered roadmap entries
     ▼
   StrategyRoadmap (dependency-ordered)    — entries reference mission templates + dependsOn
     │  instantiateRoadmap()               — spawn an AgentMission per unblocked entry
     ▼
   AgentMission[] (run by the runner)      — budgeted, HITL-gated, hibernation-capable
     │  iterateStrategy()                  — performance data → next Strategy version
     ▼
   Strategy v2 (draft) → (approve) → …     — the loop closes; the strategy stays data-driven
```

### 1.1 Artifacts

**Strategy** (`strategy.model.ts`, collection `agent_strategies`)
- `status`: `'draft' | 'active' | 'archived'`.
- `version`: monotonically increasing **per brand** (`strategyRepository.getNextVersion`).
- `parentStrategyId`: points at the prior version for diff/iteration.
- `goals[]`: `{ kpi, target, deadline }` — the measurable target shape the generator drives toward.
- `channels[]`, `contentMix` (`{ format: percent }`), `cadence`
  (`{ postsPerWeek?, emailsPerWeek?, callsPerWeek?, whatsappPerWeek? }`).
- `validation?`: deterministic-check + LLM-critic result (status, per-dimension critic scores,
  `qualityScore` 0–100 for display/sort). Absent on legacy strategies — consumers must treat it
  as optional.
- **ID-type caveat (v0):** `orgId` / `brandId` / `parentStrategyId` / `generatedFromMissionId`
  are stored as Mongoose `Mixed` (ObjectId **or** string). `Strategy` uses Mixed,
  `AgentMission` uses **string**, and `MarketingPlan` (onboarding) uses **ObjectId**. Anything
  bridging these surfaces **must normalize at the hand-off**. v0 does not unify the ID types.

**StrategyRoadmap** (`strategy-roadmap.model.ts`, collection `agent_strategy_roadmaps`)
- `entries[]`, each:
  - `id` (string, roadmap-local), `missionTemplateId` (which template to spawn),
  - `title`, `description?`,
  - `dependsOn: string[]` — IDs of entries that must be `completed` before this one spawns,
  - `channel?`, `suggestedStartOffset?` (ISO-8601 offset, e.g. `P7D`), `estimatedDurationDays?`,
  - `status`: `'pending' | 'in_progress' | 'completed' | 'skipped'`,
  - `missionId?`: set once instantiated, linking the entry back to its mission.

**AgentMission** (`agent-mission.model.ts`, collection `agent_missions`)
- The unit of execution. Full field set in §2.

### 1.2 Transforms (server-side)

| Function | File | Contract |
|---|---|---|
| `generateStrategy({ orgId, brandId, goal, constraints?, userId, parentStrategyId? })` | `strategy/generator.ts` | Reformulates a vague goal into a measurable one (§1.3), generates, runs deterministic + critic validation with bounded auto-repair/revise loops, persists a **`draft`** strategy at the next version. Returns the `IStrategy`. **Never auto-activates.** |
| `decomposeStrategy(strategyId, { orgId, brandId, userId? })` | `strategy/generator.ts` | LLM-decomposes the strategy into roadmap entries; idempotent (creates or updates the roadmap). Returns the strategy plus `roadmap`. |
| `instantiateRoadmap({ strategyId, orgId, brandId, userId })` | `strategy/instantiate.ts` | Spawns one `AgentMission` per `pending` entry **whose `dependsOn` are all completed**; marks those entries `in_progress` with their `missionId`. Returns `{ instantiated[], deferred[] }`. Deferred entries spawn later as dependencies complete. |
| `iterateStrategy({ strategyId, …, performanceData, autoActivate? })` | `strategy/instantiate.ts` | Archives the current version, generates a new draft seeded with performance notes. In Goal Mode `autoActivate: false` keeps the new version `draft` so activation re-enters the approval gate. |

### 1.3 The measurability gate (`generateStrategy`)

`generateStrategy` runs a **goal-reformulation** step first: a vague goal ("grow the business")
is converted to a measurable one (`{ kpi, target, deadline }`-shaped). It is **fail-open** —
on any error it returns the raw goal unchanged. This is why the chat tool's `goal` parameter
accepts plain user language; the framework owns the conversion. Grounding inputs are the
brand's **connected channels** and **benchmark bands** (the open `validate`/`critic` *code*; the
benchmark *dataset* itself is not part of this contract — master plan §2A.6).

---

## 2. The AgentMission record (the execution contract)

### 2.1 States

`status` is one of exactly six values:

| State | Meaning | Terminal? |
|---|---|---|
| `draft` | Created, not yet running (e.g. a future scheduled mission, a spawned-but-unstarted roadmap mission). | no |
| `active` | A turn is executing, or the auto-continue runner is dispatching turns. | no |
| `waiting` | Parked on a HITL approval; resumes when the pending action is approved/rejected. | no |
| `scheduled` | Hibernating — parked with a `wakeAt`; the cron wakes it (§5). Also used for recurring config. | no |
| `blocked` | Stopped: budget exhausted, manual kill, rejected approval, or unrecoverable error. | **yes** |
| `completed` | All goals reached / `completeMission` called and verified. | **yes** |

Canonical transition shape (from `README.md` + `hitl-gateway.ts` + `long-horizon.ts`):

```
draft → active → waiting → active → … → completed
                                       → blocked
        active → scheduled (sleep_until) → active (wake)
```

**Transition rules (normative):**
- Writers flip status **only from non-terminal states**, using conditional updates
  (`status: { $in: [...] }`), so a concurrent terminal write is never clobbered. Example: HITL
  flips to `waiting` only `{ $in: ['active','draft'] }`; budget termination sets `blocked`
  without overwriting a `completed` set by a tool.
- `completed` and `blocked` are terminal. The cron only wakes `scheduled` missions; the runner
  only dispatches continuations for non-terminal missions.

### 2.2 Modes (autonomy)

`mode` is one of exactly five values (`agent-mission.model.ts: AgentMissionMode`). Modes change
**which tool calls require human approval**, evaluated per call by the HITL gate (§4):

| Mode | Gating behavior |
|---|---|
| `watch` | Gate **every** non-read, non-mission-control tool. Read-only and mission-control tools still pass. |
| `approval-first` | Legacy alias for `watch` — same gate-all-writes behavior. |
| `mixed` | The default. Gate only tools in the brand's `requireApproval` list (plus the always-gate set). Supervised. |
| `autonomous` | Run without HITL **except** tools declared `hitlPolicy: 'always'` and the hardcoded danger list. |
| `autopilot` | Like `autonomous`, but with a **safety fallback**: when usage reaches ≥ 90% of any budget cap, the mode auto-flips to `mixed` so remaining calls go through supervised HITL instead of hard-terminating (`mission-budget.ts`). |

**Design rule (normative, D-level): chat/WhatsApp goals are never autonomous.** A goal issued
through a conversational channel is **always** created in a supervised mode. The WhatsApp
control channel hard-codes `mode: 'mixed'` for `goal <text>` missions
(`control-channel.ts`, with the inline comment *"Never autonomous from chat (design rule)"*),
and the chat agent-turn route creates copilot context with `mode: 'mixed'`. Autonomous/autopilot
execution is reachable only via the deliberate path: state the goal to the agent → it generates
a strategy → the human approves `activate_strategy` → spawned missions run. A conversational
shortcut must never silently produce an autonomous run.

### 2.3 Budgets & usage

Every mission carries a `limits` block and a `usage` block (`agent-mission.model.ts`).

| Limit (`limits.*`) | Default (`DEFAULT_MISSION_LIMITS`) | Counter (`usage.*`) | Termination reason |
|---|---|---|---|
| `maxToolCalls` | `100` | `toolCalls` | `tool_calls_exceeded` |
| `maxTokens` | `500_000` | `tokens` | `tokens_exceeded` |
| `maxWallClockMs` | `1_800_000` (30 min) | — (clock vs `sessionStartedAt`/`createdAt`) | `wallclock_exceeded` |
| `maxCredits` | `1_000` | `credits` | `budget_exceeded` |
| `maxRetriesPerTool` | `3` | `retriesByTool: { [tool]: n }` | `retry_exhausted` |

Plus `usage.idleTurns` (a no-progress counter; `MAX_IDLE_TURNS = 3`) → `no_progress`, and the
out-of-band `manual_kill`. The full `terminatedReason` enum:
`budget_exceeded | tool_calls_exceeded | tokens_exceeded | wallclock_exceeded | retry_exhausted | no_progress | manual_kill`.

**Enforcement contract (`mission-budget.ts`):**
- `checkAndIncrement(missionId, kind, amount)` atomically increments a usage counter **only if**
  the result fits the cap (a single conditional `findOneAndUpdate` with an `$expr` guard — no
  read-then-write race). Returns `{ ok:false, exceeded:<reason> }` on overflow.
- Tool-call counting happens **after** the HITL gate and **before** execution, in the registry
  wrapper. **Mission-control tools do not count** against `maxToolCalls`.
- `incrementRetry(missionId, tool)` bumps the per-tool retry counter on a thrown tool error;
  when it exceeds `maxRetriesPerTool`, the mission terminates `retry_exhausted`.
- `checkWallClock(mission)` is a pure read: elapsed is measured from `sessionStartedAt` when set
  (per **wake-session**, see §5), else from `createdAt`.
- On any overflow, `terminateMission()` sets `status: 'blocked'`, writes `terminatedReason`, and
  appends an `error` event. Tool wrappers return a structured result
  (`{ status: 'budget_exceeded' | 'retry_exhausted', reason, message }`) rather than throwing.

Limits are **set per mission at creation** (cloud builds derive them from plan features; the
fair-code core defaults to the table above, unlimited-friendly).

### 2.4 Plan & verification fields

- `plan?`: `{ goal?, steps[] }`; each step `{ id, title, description?, status, startedAt?, completedAt?, evidence? }`,
  step status one of `pending | in_progress | done | skipped | blocked`. Written by the
  `createPlan` / `setPlanStep` mission-control tools.
- **Evidence-gated completion (normative).** `completeMission` accepts an optional `verification`
  block `{ goalRestated, stepsCompleted[], evidence? { eventIds[], linkIds[] } }`. In
  **autonomous** mode this block is **required and validated**: at least one `eventId` or
  `linkId`, and every cited ID **must belong to this mission** (checked against
  `AgentMissionEvent` / `AgentMissionLink` scoped by `missionId` + `organizationId` + `userId`).
  Citing IDs that do not belong to the mission fails with `verification_failed`
  (`evidence_unverifiable`). This stops an autonomous agent from declaring success it cannot
  prove. Supervised modes recommend but do not require evidence.

### 2.5 Linkage & hibernation fields

- `strategyId?` / `templateId?` / `parentMissionId?` / `chainedFromMissionId?` — provenance:
  which strategy, which template, which parent (via `delegate_to_agent`), which completed mission
  chained into this one.
- `wakeAt? | wakeReason? | sessionStartedAt? | wakeCount?` — hibernation state (§5).
- Tenancy/scoping: `organizationId`, `brandId`, `userId` are **always** present and every query
  filters by them. In the single-tenant fair-code core, `organizationId` resolves to a fixed
  local value behind the tenancy seam (master plan §2.2); the protocol shape is identical either
  way.

---

## 3. The tool I/O contract

A tool is the unit of capability. The contract is in `src/lib/agent/tools/types.ts`.

### 3.1 RegisteredTool

```ts
interface RegisteredTool<T extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> {
  name: string;                 // unique registry key, also the LLM-visible tool name
  description: string;          // shown to the model; describes WHAT and WHEN
  parameters: T;                // a Zod schema — the input contract
  hitlPolicy?: HitlPolicy;      // declared approval policy (see §4)
  factory: (context: AgentContext) => CoreTool<T, R>;  // builds the Vercel-AI-SDK tool
}

type HitlPolicy = 'always' | 'never' | 'over_cost' | 'per_brand_config';
```

- **`parameters` is the input schema.** It is a Zod schema; the framework surfaces it to the
  model as the tool's JSON-Schema. Validation is the model+SDK's job; the executor receives a
  parsed args object.
- **`factory(context)` returns the executable tool.** The factory is where the secure,
  server-derived `AgentContext` (§3.2) is closed over — the model never supplies identity,
  tenancy, or budget; those are injected. `factory` returns a Vercel AI SDK `CoreTool` whose
  `execute(args)` does the work and returns a result.
- **Output is unconstrained but conventional.** Tools typically return a JSON-serializable object.
  The de-facto convention across the catalog is `{ success: boolean, … }` on the happy path and
  `{ success: false, error: string }` on failure (e.g. `strategy-tools.ts`). The framework does
  **not** enforce an output schema in v0; it only:
  - truncates the serialized result to `SUMMARY_CAP = 2_000` (UI excerpt) and
    `FULL_CAP = 50_000` (LLM context) for the mission timeline,
  - extracts **mission links** from the result (created artifacts → `AgentMissionLink` records +
    `artifact_created` events) via `extractMissionLinksFromToolResult`.
- The framework may **inject control results** in place of your `execute` return, without calling
  it: `{ status: 'awaiting_approval', pendingActionId, message }` (HITL),
  `{ status: 'budget_exceeded' | 'retry_exhausted', reason, message }` (budget). A tool author
  and a programmatic driver must both handle these envelope shapes.

### 3.2 AgentContext (injected, server-trusted)

```ts
interface AgentContext {
  userId: string;
  organizationId: string;          // server-derived; NEVER client-supplied
  brandId?: string;
  missionId?: string;              // present when running inside a mission
  mode?: AgentMissionMode;
  userEmail?, userName?, userRole?: 'user' | 'admin' | 'super_admin';
  enabledTools?: string[];         // per-brand allowlist; empty/absent = all
  requireApproval?: string[];      // per_brand_config gate list
  hitlOverrides?: Record<string, HitlPolicy>;  // per-brand per-tool policy override
  approvalTimeoutPolicy?: 'auto-reject' | 'auto-approve' | 'escalate';
  creditBudget?: number;
  voiceCallPolicy?: { mode: 'always_ask'|'always_autonomous'|'conditional'; conditions?: {...} };
}
```

**Hard rule:** `organizationId` (and `brandId`) come from the session/DB, never from the model
or the client. Tools must scope every read/write by `context.organizationId`.

### 3.3 The execution wrapper (what wraps every mission tool call)

When `context.missionId` is set, `tool-registry.ts` wraps `execute` so each call, in order:

1. appends a `tool_call` timeline event;
2. runs `checkHITL` — if approval is required, returns the `awaiting_approval` envelope **and
   does not execute** (mission flips to `waiting`);
3. runs `checkAndIncrement('toolCall')` unless the tool is mission-control — on overflow,
   terminates and returns `budget_exceeded`;
4. executes; on throw, `incrementRetry` — on exhaustion, terminates and returns `retry_exhausted`,
   otherwise re-throws;
5. appends a `tool_result` event (truncated), creates mission links + `artifact_created` events;
6. returns the tool's result.

Outside a mission (`missionId` absent — e.g. plain copilot chat), the raw tool runs without the
timeline/budget wrapper, but **`checkHITL` still applies** through the chat turn.

---

## 4. HITL gates (human-in-the-loop)

The gate is `checkHITL(toolName, toolArgs, context)` in `hitl-gateway.ts`. Resolution order,
**highest priority first** (normative):

1. **Exemptions never gate:** mission-control tools (`createPlan`, `setPlanStep`,
   `completeMission`, `reportBlocked`, `sleep_until`) and the read-only tool set.
2. **Effective policy** = `voiceCallPolicy` (voice tools only) → `context.hitlOverrides[tool]` →
   `registeredTool.hitlPolicy`. `'never'` short-circuits to no-gate; `'always'` forces a gate.
3. **Hardcoded danger list** (`ALWAYS_REQUIRE_APPROVAL`): high-blast-radius sends/deletes —
   `sendEmail`, `send_whatsapp_*`, `initiate_call`/`bulk_call`, `schedule_campaign`,
   `schedulePost`, `delete*`, `merge_contacts`, `request_approval`, `create_form`, `triggerWorkflow`.
4. **Mode** (`resolveGateDecision`, pure + unit-tested): `watch`/`approval-first` → gate all;
   `autonomous`/`autopilot` → pass; `mixed`/undefined → gate the brand's `requireApproval` list.

When a gate fires, the framework: creates a `PendingAgentAction`, appends an `approval_request`
event, flips the mission to `waiting`, and returns `awaiting_approval`. Resolution
(`approveAction` / `rejectAction` / `delegateAction`) writes an **audit-log** entry, appends a
status-change event, flips the mission back to `active`, and — for autonomous missions — dispatches
a continuation turn. Stale pending actions are resolved by the brand's `approvalTimeoutPolicy`
(`auto-reject` default | `auto-approve` | `escalate`).

### 4.1 The two named HITL invariants of Goal Mode

These two are part of the protocol, not configuration:

- **`generate_strategy` is never gated** — `hitlPolicy: 'never'`. Drafting a plan is free and
  reversible; producing a draft must never block on a human. (`strategy-tools.ts`.)
- **`activate_strategy` is always gated** — `hitlPolicy: 'always'`. **This single approval card is
  the human's sign-off on executing the entire strategy** (decompose → spawn every unblocked
  mission → mark active). It is *the* HITL gate of Goal Mode. `iterate_strategy` is `'never'`
  (it only produces a new draft), so the next version re-enters the same single approval at its
  own `activate_strategy`.

A conformant agent must preserve both: a draft costs no approval; turning a draft into running
work costs exactly one.

---

## 5. Hibernation (sleep_until / wake)

Long-horizon missions must not burn wall-clock idling between real-world waits. The contract
(`long-horizon.ts` + the `sleep_until` tool):

- The agent calls **`sleep_until`** (a mission-control tool: HITL-exempt, not counted against
  `maxToolCalls`, plan-gated rather than HITL-gated). The mission parks: `status → 'scheduled'`,
  `wakeAt` set, `wakeReason` recorded.
- The effective wake time is **floored** by the plan's `minWakeIntervalMinutes` (minimum 5 min),
  so an agent cannot busy-wake. Hibernation is **disabled** when the plan's
  `maxActiveSchedules === 0` (the mission must finish in-session).
- A cron (`wakeDueMissions`, ~5-min tick) wakes missions whose `wakeAt` has passed:
  `status → 'active'`, `wakeAt → null`, **`sessionStartedAt → now`** (a fresh wall-clock session
  — the wall-clock budget is **per wake-session**, not per mission lifetime),
  `usage.idleTurns → 0`, `wakeCount += 1`, and a wake event appended.
- **Autonomous/autopilot** missions get a continuation turn dispatched immediately on wake (with a
  "you are waking from a scheduled pause…" continuation prompt). **Supervised** missions just
  become `active` and the owner is notified — no autonomous continuation. (Consistent with the §2.2
  design rule.)

---

## 6. Extending the framework

This is the public extension surface — what a third party builds on. All examples are grounded in
the shipping patterns.

### 6.1 Define a custom tool

```ts
// src/lib/agent/tools/my-tools.ts
import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext, RegisteredTool } from './types';
import { toolRegistry } from '../tool-registry';

const params = z.object({
  recordId: z.string().describe('The record to act on.'),
  note: z.string().max(500).optional(),
});

export const myTool: RegisteredTool<typeof params> = {
  name: 'my_tool',                       // unique; LLM-visible
  description: 'What it does and when to use it.',
  parameters: params,                    // input contract (Zod)
  hitlPolicy: 'over_cost',               // optional; see §4
  factory: (context: AgentContext) => tool({
    description: 'What it does and when to use it.',
    parameters: params,
    execute: async (args) => {
      // ALWAYS scope by context.organizationId (and brandId). Never trust client tenancy.
      // Return a JSON-serializable result; convention: { success, ... } / { success:false, error }.
      return { success: true, recordId: args.recordId };
    },
  }),
};

toolRegistry.register(myTool);
```

Then add `import './my-tools';` to `src/lib/agent/tools/index.ts` (each tool file self-registers
on import). **Choose `hitlPolicy` deliberately:** anything that sends, spends, deletes, or has
external blast radius should be `'always'` or land in the danger list. Reads should be `'never'`
and, if side-effect-free, added to the read-only set so they pass even in `watch` mode.

### 6.2 Define a custom agent (specialist)

Agents are catalog entries (`multi-agent/agent-definitions.ts`) that scope *which tools* a
specialist may use and *how it is routed to*:

```ts
{
  id: 'my-agent',
  name: 'My Agent',
  emoji: '🛠️',
  description: 'One line used by the LLM router to pick this agent.',
  systemPromptAddition: 'Specialist instructions appended to the base system prompt.',
  tools: ['my_tool', 'createPlan', 'completeMission', 'reportBlocked', 'sleep_until'],
  intentKeywords: ['keyword', 'phrases', 'for', 'the', 'fallback', 'router'],
  requiredRole: undefined,   // optional minimum role
}
```

- `tools` is the agent's allowlist; `['*']` means all registered tools. It maps onto
  `AgentContext.enabledTools`, so the registry only exposes those tools to that agent.
- Include the mission-control tools (`createPlan`/`completeMission`/`reportBlocked`/`sleep_until`)
  for any agent that runs as a mission, or it cannot manage its own lifecycle.
- Routing: the coordinator picks the agent by LLM classification (falling back to keyword scoring
  on `intentKeywords`, then `general-agent`). Explicit `@my-agent` mentions can be wired in the
  coordinator.

### 6.3 Define a mission template

Templates (`mission-templates.ts`) are reusable mission seeds — they're what roadmap entries
reference by `missionTemplateId`, and what the launcher/triggers instantiate:

```ts
{
  id: 'my-template',
  title: 'My mission',
  description: 'What this mission does (catalog/UI copy).',
  summary: 'One-line summary stored on the mission.',
  starterPrompt: 'The instruction the agent starts from.',
  badgeLabel: 'Label',
  onComplete: ['follow-up-template-id'],     // optional: chain missions on completion
  recurring: { cron: '0 9 * * 1', label: 'Every Monday 9am' },  // optional schedule hint
}
```

- **Chaining (`onComplete`):** when a mission created from this template completes,
  `mission-lifecycle.ts` writes its output to shared `AgentMemory` (`mission_output:<id>`, 30-day
  TTL) and spawns a mission for each `onComplete` template (linked via `chainedFromMissionId`).
- **Roadmap use:** `decomposeStrategy` emits roadmap entries that reference template IDs;
  `instantiateRoadmap` spawns a mission per unblocked entry. A template referenced by a roadmap
  should exist in the catalog (an unknown ID is skipped on chaining).
- **Strategy-linked iteration:** when a mission carrying a `strategyId` completes, the lifecycle
  triggers `iterateStrategy` with that mission's performance data — closing the loop in §1.

### 6.4 Drive the agent programmatically (the lifecycle calls)

A third party building on the framework calls, in order: `generateStrategy(...)` →
present the draft → (human approves) → `decomposeStrategy(...)` → `instantiateRoadmap(...)`. In
practice the gated path is encapsulated by the chat tools (`activate_strategy` performs decompose
+ instantiate + activate behind its single `always` approval). Missions then run under the
runner with the §3/§4/§5 contracts. **Onboarding bridge note (master plan §2.3, D10):** the
onboarding goal is reformulated and fed to `generateStrategy` server-side to produce a draft on
first agent visit; activation still goes through the same single `activate_strategy` approval.

---

## 7. Conformance checklist (v0)

An implementation claiming "MontrAI Agent Protocol v0" must:

1. Model missions with **exactly** the six states (§2.1) and five modes (§2.2), and never flip a
   terminal state.
2. **Never run a chat/WhatsApp-issued goal autonomously** — supervised mode only on the
   conversational path (§2.2).
3. Enforce the two Goal-Mode HITL invariants: `generate_strategy` never gated,
   `activate_strategy` always gated (§4.1).
4. Resolve HITL in the documented priority order, exempting mission-control + read-only tools (§4).
5. Enforce per-mission budgets atomically (no read-then-write race), with the documented
   termination reasons (§2.3).
6. **Gate autonomous completion on cited, mission-owned evidence** (§2.4).
7. Honor hibernation: per-wake-session wall-clock, plan-floored wake interval, no autonomous
   continuation for supervised missions (§5).
8. Inject tenancy/identity server-side into `AgentContext`; never trust client-supplied
   `organizationId` (§3.2).

---

## 8. Out of scope for v0 (deliberately)

- **Prompts, playbook library, validation/critic *datasets*, tuned strategy models** — L2 brain
  (tiered; master plan §2A.3). The validation/critic *code* is open; the benchmark *data* is not.
- **Cross-tenant outcome data / learned playbooks / telemetry aggregate** — L3 flywheel
  (kept; opt-in/anonymized).
- **Multi-tenant fleet orchestration, the Connections Gateway broker, trust/audit at scale** —
  L4 runtime (private overlay).
- **Stability guarantees.** v0 is descriptive, not a frozen API. A v1 will tighten field names,
  unify the ID types (§1.1 caveat), and commit to a deprecation policy.

---

### Changelog
- **v0 (2026-06-26)** — initial public draft. Documents the lifecycle, mission states/modes,
  budgets/usage, HITL gates (incl. the two Goal-Mode invariants), hibernation, the tool I/O
  contract, and the tool/agent/template extension surface, grounded in `src/lib/agent/**`,
  `src/lib/strategy/**`, and the three core models. Versioned; subject to change.
