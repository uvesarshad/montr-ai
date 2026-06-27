
import { it, expect } from 'vitest';
import {
  buildAgentPrompt,
  buildAgentWorkspaceHref,
} from './launcher';

it('buildAgentPrompt appends structured module context to the base prompt', () => {
  const prompt = buildAgentPrompt('Draft the next step.', {
    source: 'crm_contact_detail',
    entityType: 'contact',
    entityId: 'contact-123',
    entityLabel: 'Ava Johnson',
    route: '/crm/contacts/contact-123',
    notes: ['Lifecycle: opportunity', 'Company: Atlas Labs'],
  });

  expect(prompt).toMatch(/Draft the next step\./);
  expect(prompt).toMatch(/Context:/);
  expect(prompt).toMatch(/Source: crm_contact_detail/);
  expect(prompt).toMatch(/contact Ava Johnson \(contact-123\)/);
  expect(prompt).toMatch(/Route: \/crm\/contacts\/contact-123/);
  expect(prompt).toMatch(/Lifecycle: opportunity/);
});

it('buildAgentPrompt returns the original prompt when no context is provided', () => {
  expect(buildAgentPrompt('Summarize this thread.')).toBe('Summarize this thread.');
});

it('buildAgentWorkspaceHref prefers mission continuation over prompt query params', () => {
  const href = buildAgentWorkspaceHref({
    missionId: 'mission-42',
    prompt: 'Ignored because mission resumes.',
  });

  expect(href).toBe('/agent?missionId=mission-42');
});

it('buildAgentWorkspaceHref encodes a contextual prompt when no mission id exists', () => {
  const href = buildAgentWorkspaceHref({
    prompt: buildAgentPrompt('Analyze this inbox thread.', {
      source: 'whatsapp_inbox',
      entityType: 'conversation',
      entityLabel: 'Nadia Patel',
    }),
  });

  expect(href).toMatch(/^\/agent\?prompt=/);
  expect(decodeURIComponent(href)).toMatch(/Analyze this inbox thread\./);
  expect(decodeURIComponent(href)).toMatch(/Source: whatsapp_inbox/);
});
