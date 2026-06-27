
import { it, expect } from 'vitest';
import {
  getCopilotStarterPrompts,
  normalizeCopilotBrandsResponse,
} from './copilot-sidebar-state';

it('normalizeCopilotBrandsResponse reads the current api payload shape', () => {
  const brands = normalizeCopilotBrandsResponse({
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

it('normalizeCopilotBrandsResponse accepts the legacy array payload too', () => {
  const brands = normalizeCopilotBrandsResponse([
    { _id: 'brand-3', name: 'Orbit' },
  ]);

  expect(brands).toEqual([
    { id: 'brand-3', name: 'Orbit', handle: undefined },
  ]);
});

it('getCopilotStarterPrompts returns mission-oriented prompts for new chats', () => {
  const prompts = getCopilotStarterPrompts(false);

  expect(prompts.length).toBe(4);
  expect(prompts[0]?.title).toBe('Plan a mission');
  expect(prompts[0]?.prompt ?? '').toMatch(/mission/i);
});

it('getCopilotStarterPrompts switches to mission follow-up actions once a conversation exists', () => {
  const prompts = getCopilotStarterPrompts(true);

  expect(prompts.length).toBe(3);
  expect(prompts[0]?.title).toBe('Summarize this mission');
  expect(prompts[0]?.prompt ?? '').toMatch(/summarize/i);
});
