import { afterEach, describe, expect, it } from 'vitest';
import {
  isPermissiveAgentAutonomy,
  resolveDefaultMissionMode,
  resolveDefaultMissionLimits,
  resolveMaxMissionsPerWindow,
  SUPERVISED_DEFAULT_MODE,
  PERMISSIVE_DEFAULT_MODE,
  SUPERVISED_MISSION_LIMITS,
  PERMISSIVE_MISSION_LIMITS,
  SUPERVISED_MAX_MISSIONS_PER_WINDOW,
  PERMISSIVE_MAX_MISSIONS_PER_WINDOW,
} from './safety-defaults';

const ORIGINAL = process.env.MONTRAI_AGENT_AUTONOMY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MONTRAI_AGENT_AUTONOMY;
  else process.env.MONTRAI_AGENT_AUTONOMY = ORIGINAL;
});

describe('agent safety defaults (H6)', () => {
  it('defaults to SUPERVISED when the env flag is unset (fresh install)', () => {
    delete process.env.MONTRAI_AGENT_AUTONOMY;
    expect(isPermissiveAgentAutonomy()).toBe(false);
    expect(resolveDefaultMissionMode()).toBe(SUPERVISED_DEFAULT_MODE);
    expect(resolveDefaultMissionMode()).toBe('approval-first');
    expect(resolveDefaultMissionLimits()).toEqual(SUPERVISED_MISSION_LIMITS);
    expect(resolveMaxMissionsPerWindow()).toBe(SUPERVISED_MAX_MISSIONS_PER_WINDOW);
  });

  it('supervised caps are strictly tighter than permissive caps', () => {
    expect(SUPERVISED_MISSION_LIMITS.maxToolCalls).toBeLessThan(PERMISSIVE_MISSION_LIMITS.maxToolCalls);
    expect(SUPERVISED_MISSION_LIMITS.maxTokens).toBeLessThan(PERMISSIVE_MISSION_LIMITS.maxTokens);
    expect(SUPERVISED_MISSION_LIMITS.maxCredits).toBeLessThan(PERMISSIVE_MISSION_LIMITS.maxCredits);
    expect(SUPERVISED_MAX_MISSIONS_PER_WINDOW).toBeLessThan(PERMISSIVE_MAX_MISSIONS_PER_WINDOW);
  });

  it('opts into the permissive (cloud/legacy) posture when explicitly set', () => {
    process.env.MONTRAI_AGENT_AUTONOMY = 'permissive';
    expect(isPermissiveAgentAutonomy()).toBe(true);
    expect(resolveDefaultMissionMode()).toBe(PERMISSIVE_DEFAULT_MODE);
    expect(resolveDefaultMissionMode()).toBe('mixed');
    expect(resolveDefaultMissionLimits()).toEqual(PERMISSIVE_MISSION_LIMITS);
    expect(resolveMaxMissionsPerWindow()).toBe(PERMISSIVE_MAX_MISSIONS_PER_WINDOW);
  });

  it('is case/whitespace tolerant on the env flag', () => {
    process.env.MONTRAI_AGENT_AUTONOMY = '  Permissive ';
    expect(isPermissiveAgentAutonomy()).toBe(true);
    process.env.MONTRAI_AGENT_AUTONOMY = 'supervised';
    expect(isPermissiveAgentAutonomy()).toBe(false);
  });
});
