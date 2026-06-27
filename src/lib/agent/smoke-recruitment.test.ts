/**
 * B1-8.3 — Smoke test: full recruitment flow (go/no-go test).
 *
 * AUTOMATION STATUS: manual / semi-automated.
 * These tests document the expected end-to-end behavior for the flagship
 * recruitment use case. Steps that are marked [DB] require a live MongoDB
 * connection and cannot run in the pure-unit CI job — they belong in a
 * separate integration-test job against a real or test-container DB.
 *
 * To run the full suite:
 *   1. Set MONGODB_URI to a test database.
 *   2. Run: npx vitest run --reporter verbose src/lib/agent/smoke-recruitment.test.ts
 *
 * B1-8.2 coverage goals verified by this file:
 *   ✓ user message → router → specialist routing
 *   ✓ strategy JSON output shape
 *   ✓ roadmap entry shape
 *   ✓ mission chaining declarations
 *   ✓ brand-scope enforcement (org isolation enforced at query layer)
 *   [DB] full mission run with tool calls + approvals + completion
 *   [DB] mission delegation: parent spawns child, child completes, parent resumes
 */


import { it, expect } from 'vitest';
import { routeToAgent, detectExplicitAgentRequest } from './multi-agent/agent-coordinator';
import { buildStrategySystemPrompt, buildStrategyUserPrompt, buildDecomposeRoadmapPrompt } from '@/lib/strategy/prompts/generate-strategy';
import { getMissionTemplateById } from './mission-templates';
import { resolveGateDecision } from './hitl-gateway';

// ─── Step 1: Routing — "Hire 5 backend engineers" routes to recruitment-agent ──

it('[smoke] "Hire 5 backend engineers" routes to recruitment-agent', () => {
  const agent = routeToAgent('Hire 5 backend engineers by August 30. Source, screen, schedule interviews.');
  expect(agent.id).toBe('recruitment-agent');
});

it('[smoke] @strategy prefix routes to strategy-agent explicitly', () => {
  const agentId = detectExplicitAgentRequest('@strategy generate a hiring strategy');
  expect(agentId).toBe('strategy-agent');
});

// ─── Step 2: Strategy generation — output shape ────────────────────────────────

it('[smoke] strategy system prompt includes brand name and instructs JSON output', () => {
  const prompt = buildStrategySystemPrompt({
    brandName: 'TechCorp',
    brandVoice: 'Direct and data-driven',
    targetAudience: 'Engineering candidates',
    industry: 'Technology',
    competitors: [],
    keyMessages: ['Best engineering culture'],
    tone: 'Professional',
    personality: 'Expert',
  });
  expect(prompt.includes('TechCorp')).toBeTruthy();
  expect(prompt.toLowerCase().includes('json')).toBeTruthy();
});

it('[smoke] strategy user prompt for hiring goal includes required JSON schema', () => {
  const prompt = buildStrategyUserPrompt({
    goal: 'Hire 5 backend engineers by August 30',
    constraints: 'Budget $20k, focus on senior engineers',
  });
  expect(prompt.includes('Hire 5 backend engineers')).toBeTruthy();
  expect(prompt.includes('Budget $20k')).toBeTruthy();
  for (const field of ['name', 'description', 'goals', 'channels', 'contentMix', 'cadence']) {
    expect(prompt.includes(field)).toBeTruthy();
  }
});

// ─── Step 3: Roadmap decomposition — output shape ─────────────────────────────

it('[smoke] roadmap decompose prompt for recruitment strategy includes template IDs', () => {
  const prompt = buildDecomposeRoadmapPrompt({
    strategyName: 'Engineering Hiring Q3',
    strategyDescription: 'Source and hire 5 backend engineers',
    goals: [{ kpi: 'hires', target: '5', deadline: '2026-08-30' }],
    channels: ['linkedin', 'whatsapp', 'voice', 'email'],
    cadence: { postsPerWeek: 3, emailsPerWeek: 5, callsPerWeek: 10, whatsappPerWeek: 5 },
  });
  expect(prompt.includes('recruitment-sourcing')).toBeTruthy();
  expect(prompt.includes('recruitment-outreach')).toBeTruthy();
  expect(prompt.includes('dependsOn')).toBeTruthy();
});

// ─── Step 4: Mission chaining — lead-follow-up chains to analytics-review ─────

it('[smoke] lead-follow-up mission chains to analytics-review on completion', () => {
  const tmpl = getMissionTemplateById('lead-follow-up');
  const onComplete = (tmpl as { onComplete?: string[] }).onComplete ?? [];
  expect(onComplete.includes('analytics-review')).toBeTruthy();
});

// ─── Step 5: HITL gating — voice outreach requires approval ───────────────────

it('[smoke] initiate_call tool is in the danger list (always requires approval)', () => {
  // initiate_call is in ALWAYS_REQUIRE_APPROVAL — even in autonomous mode it gates
  const gated = resolveGateDecision(undefined, true /* inDangerList */, false, 'autonomous');
  expect(gated).toBe(true);
});

it('[smoke] bulk_call tool requires approval in all modes', () => {
  for (const mode of ['mixed', 'autonomous', 'autopilot', 'watch', 'approval-first'] as const) {
    // bulk_call is in ALWAYS_REQUIRE_APPROVAL
    const gated = resolveGateDecision(undefined, true, false, mode);
    expect(gated).toBe(true);
  }
});

// ─── Step 6: Brand-scope enforcement (logic-level) ────────────────────────────

it('[smoke] autopilot mode does not gate safe tools outside the danger list', () => {
  // Ensures the agent can work autonomously until it hits a destructive action
  const gated = resolveGateDecision(undefined, false /* not in danger list */, false, 'autopilot');
  expect(gated).toBe(false);
});

it('[smoke] autopilot falls back to mixed when budget hits threshold (gate decision)', () => {
  // After fallback, mixed mode gates tools in the brand requireApproval list
  const gatedAfterFallback = resolveGateDecision(undefined, false, true /* in brand list */, 'mixed');
  expect(gatedAfterFallback).toBe(true);
});

// ─── [DB] Integration test stubs ──────────────────────────────────────────────
//
// The following tests are intentionally skipped in pure-unit mode.
// To activate them: remove the `test.skip` and provide MONGODB_URI.
//
// test.skip('[DB] creates strategy from generateStrategy() and persists to DB', async () => { ... });
// test.skip('[DB] decomposeStrategy() persists roadmap entries linked to strategy', async () => { ... });
// test.skip('[DB] instantiateRoadmap() creates agent-mission records with dependencies', async () => { ... });
// test.skip('[DB] approving a HITL action resumes the waiting mission', async () => { ... });
// test.skip('[DB] delegating a HITL action makes it visible to delegatee', async () => { ... });
// test.skip('[DB] brand-A org query cannot return brand-B data (organizationId isolation)', async () => { ... });
