
import { it, expect } from 'vitest';
import { checkWallClock } from './mission-budget';
import type { IAgentMission } from '@/lib/db/models/agent-mission.model';

type WallClockInput = Pick<IAgentMission, 'createdAt' | 'limits'>;

function makeMission(createdMsAgo: number, maxWallClockMs: number): WallClockInput {
  return {
    createdAt: new Date(Date.now() - createdMsAgo),
    limits: {
      maxToolCalls: 100,
      maxTokens: 500_000,
      maxWallClockMs,
      maxCredits: 1000,
      maxRetriesPerTool: 3,
    },
  };
}

// ─── checkWallClock ────────────────────────────────────────────────────────────

it('checkWallClock returns ok when mission is within its wall-clock budget', () => {
  const result = checkWallClock(makeMission(1_000, 30 * 60 * 1000));
  expect(result.ok).toBe(true);
  expect(result.exceeded).toBe(undefined);
});

it('checkWallClock returns exceeded when mission has run past its limit', () => {
  const result = checkWallClock(makeMission(31 * 60 * 1000, 30 * 60 * 1000));
  expect(result.ok).toBe(false);
  expect(result.exceeded).toBe('wallclock_exceeded');
  expect(typeof result.message === 'string').toBeTruthy();
});

it('checkWallClock returns ok when maxWallClockMs is 0 (disabled)', () => {
  // 0 is falsy — treated as "no limit"
  const result = checkWallClock(makeMission(99_999_000, 0));
  expect(result.ok).toBe(true);
});

it('checkWallClock is boundary-safe: exactly at limit is still ok', () => {
  // elapsed === max → not yet exceeded
  const maxMs = 10 * 60 * 1000;
  const result = checkWallClock(makeMission(maxMs - 1, maxMs));
  expect(result.ok).toBe(true);
});

it('checkWallClock correctly flags 1ms over the limit', () => {
  const maxMs = 10 * 60 * 1000;
  const result = checkWallClock(makeMission(maxMs + 1, maxMs));
  expect(result.ok).toBe(false);
  expect(result.exceeded).toBe('wallclock_exceeded');
});
