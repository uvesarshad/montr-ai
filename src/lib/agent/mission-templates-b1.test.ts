/**
 * B1-8.1 — Unit tests for mission template extensions added in Bundle 1.
 * Verifies that recurring + chaining metadata is correctly declared on templates.
 */

import { it, expect } from 'vitest';
import { getMissionTemplateById, getMissionTemplates } from './mission-templates';

// ─── onComplete chaining ───────────────────────────────────────────────────────

it('analytics-review template declares onComplete pointing to campaign-launch', () => {
  const tmpl = getMissionTemplateById('analytics-review');
  expect(tmpl).toBeTruthy();
  expect(Array.isArray((tmpl as { onComplete?: unknown }).onComplete)).toBeTruthy();
  expect(((tmpl as { onComplete?: string[] }).onComplete ?? []).includes('campaign-launch')).toBeTruthy();
});

it('lead-follow-up template declares onComplete pointing to analytics-review', () => {
  const tmpl = getMissionTemplateById('lead-follow-up');
  expect(tmpl).toBeTruthy();
  expect(((tmpl as { onComplete?: string[] }).onComplete ?? []).includes('analytics-review')).toBeTruthy();
});

// ─── recurring config ──────────────────────────────────────────────────────────

it('analytics-review template declares recurring cron schedule', () => {
  const tmpl = getMissionTemplateById('analytics-review');
  const recurring = (tmpl as { recurring?: { cron: string; label: string } }).recurring;
  expect(recurring).toBeTruthy();
  expect(typeof recurring.cron === 'string' && recurring.cron.length > 0).toBeTruthy();
  expect(typeof recurring.label === 'string' && recurring.label.length > 0).toBeTruthy();
});

it('performance-review template declares recurring cron schedule', () => {
  const tmpl = getMissionTemplateById('performance-review');
  expect(tmpl).toBeTruthy();
  const recurring = (tmpl as { recurring?: { cron: string; label: string } }).recurring;
  expect(recurring).toBeTruthy();
  expect(recurring.cron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
});

// ─── all templates have required fields ───────────────────────────────────────

it('all mission templates have id, title, description, summary, starterPrompt', () => {
  const templates = getMissionTemplates();
  for (const tmpl of templates) {
    expect(tmpl.id).toBeTruthy();
    expect(tmpl.title).toBeTruthy();
    expect(tmpl.description).toBeTruthy();
    expect(tmpl.summary).toBeTruthy();
    expect(tmpl.starterPrompt).toBeTruthy();
  }
});
