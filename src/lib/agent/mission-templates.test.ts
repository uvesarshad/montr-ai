
import { it, expect } from 'vitest';
import {
  getDefaultMissionViews,
  getMissionTemplateById,
  getMissionTemplates,
} from './mission-templates';

it('getMissionTemplates returns the core operational templates in stable order', () => {
  const templates = getMissionTemplates();

  expect(templates.map((template) => template.id)).toEqual([
      'campaign-launch',
      'content-repurpose',
      'lead-follow-up',
      'analytics-review',
      'knowledge-synthesis',
      'recruitment',
      'content-factory',
      'inbox-triage',
      'follow-up-cadence',
      'win-back',
      'performance-review',
      'prospect-engagement',
    ]);
  expect(templates[0]?.title).toBe('Campaign launch');
  expect(templates[0]?.starterPrompt || '').toMatch(/launch/i);
});

it('getMissionTemplateById returns a template payload used to seed a mission', () => {
  const template = getMissionTemplateById('lead-follow-up');

  expect(template).toEqual({
    id: 'lead-follow-up',
    title: 'Lead follow-up',
    description: 'Organize next-touch outreach, task sequencing, and follow-up messaging.',
    summary: 'Build a follow-up mission for pipeline movement and consistent outreach.',
    starterPrompt: 'Create a lead follow-up mission. Identify the highest-priority contacts, suggest the next touch for each, and turn the work into a clear action plan.',
    badgeLabel: 'CRM',
    // Mission chaining: completing lead follow-up seeds an analytics review.
    onComplete: ['analytics-review'],
  });
});

it('getDefaultMissionViews returns operational saved views for the mission rail', () => {
  const views = getDefaultMissionViews();

  expect(views).toEqual([
    { id: 'active', label: 'Active', status: 'active' },
    { id: 'approval', label: 'Needs approval', status: 'waiting' },
    { id: 'scheduled', label: 'Scheduled', status: 'scheduled' },
    { id: 'completed', label: 'Completed', status: 'completed' },
    { id: 'all', label: 'All missions' },
  ]);
});
