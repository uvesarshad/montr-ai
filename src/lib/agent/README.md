# Agent Library — Developer Reference

> `src/lib/agent/` — mission execution, tool registry, HITL, multi-agent routing, strategy pipeline.

---

## Mission lifecycle

```
draft → active → waiting → active → ... → completed
                                         → blocked
                                         → scheduled (recurring, not terminal)
```

- `draft` — created but not yet running (e.g., scheduled future mission)
- `active` — AI turn is executing or auto-continue runner is polling
- `waiting` — paused for a HITL approval; resumes when action is resolved
- `scheduled` — recurring mission config; does not represent a running turn
- `completed` — terminal; all goals reached or `completeMission` tool called
- `blocked` — terminal; budget exhausted, manual kill, or unrecoverable error

Transitions are written by `missions.ts` and `hitl-gateway.ts`. Only flip from non-terminal states to avoid overwriting a terminal status set by a concurrent operation.

---

## Budget limits

Every mission has a `limits` block (set from plan features at creation time):

| Field | Default | Terminates with |
|---|---|---|
| `maxToolCalls` | 100 | `tool_calls_exceeded` |
| `maxTokens` | 500 000 | `tokens_exceeded` |
| `maxWallClockMs` | 1 800 000 (30 min) | `wallclock_exceeded` |
| `maxCredits` | 1 000 | `budget_exceeded` |
| `maxRetriesPerTool` | 3 | — |

`checkAndIncrement(missionId, kind, amount)` in `mission-budget.ts` atomically increments the usage counter only if the result fits within the limit. On overflow it returns `{ ok: false, exceeded: reason }`.

**Auto-pilot fallback (B1-7.4):** when `checkAndIncrement` finds the mission is in `autopilot` mode and usage reaches ≥ 90% of any cap, it flips the mission to `mixed` mode. Remaining tool calls then go through the brand-list HITL gate rather than hard-terminating.

---

## Tool registration

All tools live in `src/lib/agent/tools/` and are registered in `tool-registry.ts`.

```ts
import { RegisteredTool, HitlPolicy } from '@/lib/agent/tools/types';

export const myTool: RegisteredTool<typeof inputSchema> = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: inputSchema,          // Zod schema
  hitlPolicy: 'always',             // optional; see HITL below
  factory: (context) => ({
    description: 'What this tool does',
    parameters: inputSchema,
    execute: async (args) => { /* ... */ },
  }),
};
```

Register via `toolRegistry.register(myTool)` in `tool-registry.ts`.

### `hitlPolicy` values

| Value | Meaning |
|---|---|
| `'always'` | Always gate, regardless of mode |
| `'never'` | Never gate; skip HITL even in approval-first mode |
| `'over_cost'` | Gate when in the danger list OR the brand's `requireApproval` list |
| `'per_brand_config'` | Gate only if in the brand's `requireApproval` list |
| _(omitted)_ | Default: danger-list + mode logic (see below) |

---

## HITL gateway

`hitl-gateway.ts` intercepts tool calls before execution.

### Resolution order (highest priority first)

1. **Mission-control / read-only exemptions** — `createPlan`, `completeMission`, `reportBlocked`, and all read-only tools are never gated.
2. **`context.hitlOverrides[toolName]`** — per-brand per-tool policy override (in `AgentContext`).
3. **`registeredTool.hitlPolicy`** — tool's own declared policy.
4. **`ALWAYS_REQUIRE_APPROVAL` set** — hardcoded danger list (WhatsApp sends, voice calls, campaign sends, destructive ops).
5. **Mission mode** — `watch`/`approval-first` gates all remaining; `autopilot`/`autonomous` passes all; `mixed`/undefined gates the brand's `requireApproval` list.

### Pure gate-decision helper

```ts
import { resolveGateDecision } from '@/lib/agent/hitl-gateway';

const shouldGate = resolveGateDecision(
  effectivePolicy,  // 'always' | 'per_brand_config' | 'over_cost' | undefined
  inDangerList,     // boolean — tool is in ALWAYS_REQUIRE_APPROVAL
  inBrandList,      // boolean — tool is in context.requireApproval
  mode,             // mission mode string
);
```

This function is pure (no DB calls) and fully unit-tested in `hitl-gateway.test.ts`.

### Approval delegation (B1-7.2)

```ts
await delegateAction(actionId, delegateTo, delegatedBy, { organizationId });
```

- Sets `delegatedTo`, `delegatedBy`, `delegatedAt` on the `PendingAgentAction`.
- Delegatee sees the action via `getPendingActions` (queries `$or: [{ userId }, { delegatedTo: userId }]`).
- Delegation is still `pending`; the delegatee must approve or reject.

### Approval timeout policy (B1-7.5)

`getPendingActions(userId, missionId, brandId, timeoutPolicy)` applies the policy to stale (past `expiresAt`) actions before returning live ones:

| Policy | Behaviour |
|---|---|
| `'auto-reject'` | Marks stale actions `expired`, blocks mission (default) |
| `'auto-approve'` | Marks stale actions `approved`, resumes mission |
| `'escalate'` | Marks `delegatedTo: 'escalated:<orgId>'`; keeps pending for admin review |

---

## Execution modes

| Mode | Description |
|---|---|
| `watch` | Every tool call requires approval (equivalent to `approval-first`) |
| `supervised` / `mixed` | HITL only for tools in the brand's `requireApproval` list |
| `autopilot` | Runs autonomously; only danger-list tools gate; flips to `mixed` at 90% cap |
| `approval-first` | Legacy alias for `watch` |
| `autonomous` | Runs without HITL except for explicit `hitlPolicy: 'always'` tools |

Mode is stored on the mission record and checked by `resolveGateDecision` on every tool call.

---

## Multi-agent routing

`multi-agent/agent-coordinator.ts` routes user messages to specialist agents.

### Primary path — LLM router

```ts
const result = await routeToAgentWithLLM(message, userId, userRole, preferredAgentId?);
// result.agent, result.confidence, result.needsDisambiguation?
```

- Uses `plan.agent.routerModel` (default: `claude-haiku-4-5-20251001`).
- Returns `needsDisambiguation: true` when confidence < 0.6.
- Falls back to keyword scoring if the LLM call fails.

### Fallback — keyword scorer

```ts
const agent = routeToAgent(message, userRole, preferredAgentId?);
```

Scores agents by summing keyword match lengths (longer = more specific). Falls back to `general-agent` on no match.

### Explicit mention detection

```ts
const agentId = detectExplicitAgentRequest('@crm add a deal'); // 'crm-agent'
```

Supported prefixes: `@crm`, `@social`, `@knowledge`, `@recruit`, `@content-factory`, `@inbox`, `@strategy`, `@ops` (also answers `@automation`), `@voice`.

### Agent catalog

Agents are defined in `multi-agent/agent-definitions.ts`. Each agent has:
- `id`, `name`, `description` — used in LLM classification prompt
- `intentKeywords` — used in keyword fallback
- `tools` — allowed tool list (`['*']` = all tools)
- `requiredRole?` — minimum role to access the agent (none currently set; the former admin-only automation-agent was folded into ops-agent 2026-06-05)

`getAccessibleAgents(userRole)` filters the catalog by role before routing.

---

## Strategy → roadmap → mission pipeline

```
generateStrategy()       → Strategy (versioned DB entity)
    ↓
decomposeStrategy()      → StrategyRoadmap (ordered mission templates + deps)
    ↓
instantiateRoadmap()     → AgentMission records (scheduled, linked, dep-ordered)
    ↓
iterateStrategy()        → new Strategy version (after missions complete + analytics)
```

- `src/lib/strategy/generator.ts` — `generateStrategy({ brandId, goal, constraints? })`
- `src/lib/strategy/prompts/generate-strategy.ts` — system + user prompts; exports `buildStrategySystemPrompt`, `buildStrategyUserPrompt`, `buildDecomposeRoadmapPrompt`
- Strategy reads `brand-context.model.ts` + `brand-memory` automatically; brand context block is prompt-cached.
- `iterateStrategy` reuses the same cached brand context block, so regeneration only pays for the delta.

---

## Mission templates and chaining

`mission-templates.ts` defines reusable mission configurations. Each template can declare:

```ts
{
  id: 'lead-follow-up',
  onComplete: ['analytics-review'],   // missions to spawn on completion
  recurring?: { cron: '0 9 * * 1' }, // weekly recurring config
}
```

`instantiateRoadmap` wires dependencies: mission B's `scheduledFor` is not set until mission A transitions to `completed`.

---

## Compaction

`compaction-engine.ts` summarises the event log when the running token count approaches the model's context window. The compact summary is injected as the first system message on subsequent turns, replacing the raw event history.

---

## Scheduled tasks

`scheduled-task-runner.ts` reads `agent_scheduled_tasks` and fires missions on cron schedule. The cron trigger endpoint calls `runDueScheduledTasks()`. Recurring missions produce a new `AgentMission` each run; the previous run must be in a terminal state before the next fires.

---

## Event triggers

`mission-trigger-service.ts` listens to the domain event bus (`src/lib/workflow/events/bus.ts`) and auto-starts missions when a matching event fires (e.g., `crm.deal.stage_changed` → fire `deal-stage-nurture` template).

---

## Key files

| File | Purpose |
|---|---|
| `missions.ts` | Mission CRUD — `createMission`, `getMission`, `killMission` |
| `agent-chat-route.ts` | Drives one AI conversation turn; calls `generateTextWithClient` |
| `tool-registry.ts` | Registry; `register(tool)`, `getTool(name)`, `getToolsForAgent(agent)` |
| `hitl-gateway.ts` | HITL interception — `checkHITL`, `approveAction`, `rejectAction`, `delegateAction`, `getPendingActions` |
| `mission-budget.ts` | `checkAndIncrement`, `checkWallClock` |
| `mission-context.ts` | Builds the system prompt from mission + brand context |
| `compaction-engine.ts` | Event log summarisation |
| `mission-templates.ts` | Template catalog + `getMissionTemplateById` |
| `mission-lifecycle.ts` | Terminal transition helpers |
| `mission-trigger-service.ts` | Event-driven mission firing |
| `scheduled-task-runner.ts` | Cron-based mission scheduler |
| `plan-gate.ts` | Plan-tier enforcement for agent features |
| `multi-agent/agent-coordinator.ts` | LLM + keyword router |
| `multi-agent/agent-definitions.ts` | Agent catalog |
| `multi-agent/agent-session-manager.ts` | Per-brand session state |

---

## Testing

Unit tests use `node:test` (matching the existing codebase pattern):

| File | Coverage |
|---|---|
| `hitl-gateway.test.ts` | `resolveGateDecision` — all policy × mode combinations |
| `mission-budget.test.ts` | `checkWallClock` — budget gates and result shape |
| `mission-templates-b1.test.ts` | Template chaining declarations and cron validity |
| `mission-telemetry.test.ts` | Cost telemetry contract + 90% threshold arithmetic |
| `smoke-recruitment.test.ts` | End-to-end routing → strategy → HITL smoke test |
| `multi-agent/agent-coordinator.test.ts` | Keyword router and explicit mention detection |

DB-dependent integration tests (full mission runs, delegation flows, org isolation) are stubbed with `test.skip` in `smoke-recruitment.test.ts`. Run them by providing `MONGODB_URI`.

---

## Deferred features

- **Google Ads / Meta Ads tools** — planned for the next bundle cycle; will slot into the tool registry under `hitlPolicy: 'always'` given campaign spend risk.
- **Agent fine-tuning on brand data** — requires evaluation infrastructure (golden prompt/response pairs, automated scoring). Deferred until evals pipeline is live.
- **Cross-org agent marketplace** — shared templates visible across organisations; blocked on multi-tenant marketplace schema design.
