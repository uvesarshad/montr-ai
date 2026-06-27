
import { it, expect } from 'vitest';
import { resolveGateDecision } from './hitl-gateway';

// ─── resolveGateDecision — explicit policies ───────────────────────────────────

it('resolveGateDecision: always policy gates regardless of mode', () => {
  expect(resolveGateDecision('always', false, false, 'autonomous')).toBe(true);
  expect(resolveGateDecision('always', false, false, 'mixed')).toBe(true);
  expect(resolveGateDecision('always', false, false, undefined)).toBe(true);
});

it('resolveGateDecision: per_brand_config only gates when tool is in brand list', () => {
  expect(resolveGateDecision('per_brand_config', false, true, 'mixed')).toBe(true);
  expect(resolveGateDecision('per_brand_config', false, false, 'mixed')).toBe(false);
  // danger list is irrelevant for per_brand_config
  expect(resolveGateDecision('per_brand_config', true, false, 'mixed')).toBe(false);
});

it('resolveGateDecision: over_cost gates if in danger list or brand list', () => {
  expect(resolveGateDecision('over_cost', true, false, 'mixed')).toBe(true);
  expect(resolveGateDecision('over_cost', false, true, 'mixed')).toBe(true);
  expect(resolveGateDecision('over_cost', false, false, 'mixed')).toBe(false);
});

// ─── resolveGateDecision — no explicit policy (mode-based) ────────────────────

it('resolveGateDecision: danger list always gates even in autonomous mode', () => {
  expect(resolveGateDecision(undefined, true, false, 'autonomous')).toBe(true);
  expect(resolveGateDecision(undefined, true, false, 'autopilot')).toBe(true);
  expect(resolveGateDecision(undefined, true, false, 'mixed')).toBe(true);
});

it('resolveGateDecision: autonomous mode does not gate non-danger tools', () => {
  expect(resolveGateDecision(undefined, false, false, 'autonomous')).toBe(false);
  expect(resolveGateDecision(undefined, false, true, 'autonomous')).toBe(false);
});

it('resolveGateDecision: autopilot mode does not gate non-danger tools', () => {
  expect(resolveGateDecision(undefined, false, false, 'autopilot')).toBe(false);
  expect(resolveGateDecision(undefined, false, true, 'autopilot')).toBe(false);
});

it('resolveGateDecision: approval-first mode gates non-danger tools', () => {
  expect(resolveGateDecision(undefined, false, false, 'approval-first')).toBe(true);
});

it('resolveGateDecision: watch mode gates non-danger tools', () => {
  expect(resolveGateDecision(undefined, false, false, 'watch')).toBe(true);
});

it('resolveGateDecision: mixed mode gates only tools in brand requireApproval list', () => {
  expect(resolveGateDecision(undefined, false, true, 'mixed')).toBe(true);
  expect(resolveGateDecision(undefined, false, false, 'mixed')).toBe(false);
});

it('resolveGateDecision: undefined mode behaves like mixed (brand list only)', () => {
  expect(resolveGateDecision(undefined, false, true, undefined)).toBe(true);
  expect(resolveGateDecision(undefined, false, false, undefined)).toBe(false);
});

// ─── policy beats mode ─────────────────────────────────────────────────────────

it('resolveGateDecision: always policy overrides autonomous mode', () => {
  expect(resolveGateDecision('always', false, false, 'autonomous')).toBe(true);
  expect(resolveGateDecision('always', false, false, 'autopilot')).toBe(true);
});

it('resolveGateDecision: per_brand_config in approval-first mode respects brand list, not mode', () => {
  // per_brand_config is about the brand list; mode is superseded by explicit policy
  expect(resolveGateDecision('per_brand_config', false, false, 'approval-first')).toBe(false);
  expect(resolveGateDecision('per_brand_config', false, true, 'approval-first')).toBe(true);
});
