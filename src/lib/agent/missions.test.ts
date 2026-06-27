
import { it, expect } from 'vitest';
import {
  deriveMissionSummary,
  getMissionTitleFromPrompt,
  trimMissionMessages,
} from './missions';

it('getMissionTitleFromPrompt builds a concise mission title from the first prompt', () => {
  const title = getMissionTitleFromPrompt('Plan a launch mission for our new B2B analytics product across email and LinkedIn.');

  expect(title).toBe('Plan a launch mission for our new B2B analytics');
});

it('getMissionTitleFromPrompt falls back when prompt is empty', () => {
  expect(getMissionTitleFromPrompt('   ')).toBe('New mission');
});

it('deriveMissionSummary prefers the latest assistant message', () => {
  const summary = deriveMissionSummary([
    { role: 'user', content: 'Help me plan this launch.' },
    { role: 'assistant', content: 'Start with positioning, channel selection, and a 7-day sequence.' },
  ]);

  expect(summary).toBe('Start with positioning, channel selection, and a 7-day sequence.');
});

it('deriveMissionSummary falls back to the latest user message when needed', () => {
  const summary = deriveMissionSummary([
    { role: 'user', content: 'Draft a mission for our onboarding email refresh.' },
  ]);

  expect(summary).toBe('Draft a mission for our onboarding email refresh.');
});

it('trimMissionMessages keeps only the newest mission messages within the cap', () => {
  const trimmed = trimMissionMessages(
    Array.from({ length: 55 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `message-${index}`,
    })),
    50,
  );

  expect(trimmed.length).toBe(50);
  expect(trimmed[0]?.content).toBe('message-5');
  expect(trimmed[49]?.content).toBe('message-54');
});
