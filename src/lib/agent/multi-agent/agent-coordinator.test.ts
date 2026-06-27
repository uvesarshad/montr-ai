
import { it, expect } from 'vitest';
import { routeToAgent, detectExplicitAgentRequest } from './agent-coordinator';

// ─── routeToAgent (keyword router) ────────────────────────────────────────────

it('routeToAgent routes CRM keywords to crm-agent', () => {
  const agent = routeToAgent('Create a new contact in the CRM and add a deal to the pipeline');
  expect(agent.id).toBe('crm-agent');
});

it('routeToAgent routes social media keywords to social-agent', () => {
  const agent = routeToAgent('Schedule a LinkedIn post about our new product launch');
  expect(agent.id).toBe('social-agent');
});

it('routeToAgent routes knowledge base queries to knowledge-agent', () => {
  const agent = routeToAgent('Search the knowledge base for our onboarding documentation');
  expect(agent.id).toBe('knowledge-agent');
});

it('routeToAgent routes workflow keywords to ops-agent (automation-agent folded in)', () => {
  // automation-agent was folded into ops-agent (2026-06-05) — admins route there too
  const agent = routeToAgent('Trigger the automation workflow and execute the cron job', 'admin');
  expect(agent.id).toBe('ops-agent');
});

it('routeToAgent routes call keywords to voice-agent', () => {
  const agent = routeToAgent('Call the prospect on the phone and get the call transcript');
  expect(agent.id).toBe('voice-agent');
});

it('routeToAgent routes ops keywords to ops-agent for regular users', () => {
  const agent = routeToAgent('Trigger the workflow and approve the pending task queue item', 'user');
  expect(agent.id).toBe('ops-agent');
});

it('routeToAgent routes recruitment keywords to recruitment-agent', () => {
  const agent = routeToAgent('Source backend engineers, screen candidates, and schedule interviews');
  expect(agent.id).toBe('recruitment-agent');
});

it('routeToAgent falls back to general-agent for ambiguous messages', () => {
  const agent = routeToAgent('Help me with something');
  expect(agent.id).toBe('general-agent');
});

it('routeToAgent respects preferredAgentId override', () => {
  const agent = routeToAgent('Help me with something', 'user', 'crm-agent');
  expect(agent.id).toBe('crm-agent');
});

it('routeToAgent returns a valid agent with required fields', () => {
  const agent = routeToAgent('Send a WhatsApp campaign to all leads');
  expect(typeof agent.id === 'string').toBeTruthy();
  expect(typeof agent.name === 'string').toBeTruthy();
  expect(Array.isArray(agent.intentKeywords)).toBeTruthy();
});

// ─── detectExplicitAgentRequest ────────────────────────────────────────────────

it('detectExplicitAgentRequest detects @crm prefix', () => {
  expect(detectExplicitAgentRequest('@crm add a new deal')).toBe('crm-agent');
});

it('detectExplicitAgentRequest detects @social prefix', () => {
  expect(detectExplicitAgentRequest('@social schedule a post')).toBe('social-agent');
});

it('detectExplicitAgentRequest detects @recruit prefix', () => {
  expect(detectExplicitAgentRequest('@recruit find me 5 engineers')).toBe('recruitment-agent');
});

it('detectExplicitAgentRequest detects @strategy prefix', () => {
  expect(detectExplicitAgentRequest('@strategy generate a Q4 plan')).toBe('strategy-agent');
});

it('detectExplicitAgentRequest returns null for plain messages', () => {
  expect(detectExplicitAgentRequest('Create a new contact')).toBe(null);
});

it('detectExplicitAgentRequest is case-insensitive', () => {
  expect(detectExplicitAgentRequest('Ask the INBOX AGENT to reply')).toBe('inbox-agent');
});
