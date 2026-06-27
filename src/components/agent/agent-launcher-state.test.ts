
import { it, expect } from 'vitest';
import {
  getAgentStarterPrompts,
  normalizeAgentBrandsResponse,
} from './agent-launcher-state';

it('normalizeAgentBrandsResponse reads the current api payload shape', () => {
  const brands = normalizeAgentBrandsResponse({
    brands: [
      { _id: 'brand-1', name: 'Montr', handle: 'montr' },
      { _id: 'brand-2', name: 'Atlas Labs' },
    ],
  });

  expect(brands).toEqual([
    { id: 'brand-1', name: 'Montr', handle: 'montr' },
    { id: 'brand-2', name: 'Atlas Labs', handle: undefined },
  ]);
});

it('normalizeAgentBrandsResponse accepts the legacy array payload too', () => {
  const brands = normalizeAgentBrandsResponse([
    { _id: 'brand-3', name: 'Orbit' },
  ]);

  expect(brands).toEqual([
    { id: 'brand-3', name: 'Orbit', handle: undefined },
  ]);
});

it('getAgentStarterPrompts prioritizes mission-oriented prompts for new threads', () => {
  const prompts = getAgentStarterPrompts(false);

  expect(prompts.length).toBe(4);
  expect(prompts[0]?.title).toBe('Plan a mission');
  expect(prompts[0]?.prompt ?? '').toMatch(/mission/i);
});

it('getAgentStarterPrompts switches to mission follow-up actions once a conversation exists', () => {
  const prompts = getAgentStarterPrompts(true);

  expect(prompts.length).toBe(3);
  expect(prompts[0]?.title).toBe('Summarize this mission');
  expect(prompts[1]?.prompt ?? '').toMatch(/next/i);
});
