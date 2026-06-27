
import { it, expect } from 'vitest';
import { getMissionLinkPresentation } from './mission-link-presenter';

it('getMissionLinkPresentation highlights brand memory entries as reusable knowledge', () => {
  const presentation = getMissionLinkPresentation({
    _id: 'link-1',
    missionId: 'mission-1',
    targetType: 'brand_memory',
    targetId: 'kb-1',
    targetLabel: 'Voice and tone guardrails',
    targetRoute: '/settings?tab=brand-memory',
    metadata: {
      sourceTool: 'addToKnowledgeBase',
    },
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  });

  expect(presentation).toEqual({
    title: 'Voice and tone guardrails',
    badgeLabel: 'Brand memory',
    detail: 'Saved to reusable brand knowledge for future agent decisions.',
    routeLabel: 'Open Brand Memory',
    icon: 'brand_memory',
  });
});

it('getMissionLinkPresentation explains roadmap tasks based on the source action', () => {
  const created = getMissionLinkPresentation({
    _id: 'link-2',
    missionId: 'mission-1',
    targetType: 'roadmap_task',
    targetId: 'task-1',
    targetLabel: 'Draft launch email sequence',
    targetRoute: '/dashboard',
    metadata: {
      sourceTool: 'addRoadmapTask',
      taskType: 'campaign',
    },
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  });

  expect(created).toEqual({
    title: 'Draft launch email sequence',
    badgeLabel: 'Campaign task',
    detail: 'Added to the marketing roadmap as mission-linked work.',
    routeLabel: 'Open Roadmap',
    icon: 'roadmap_task',
  });

  const completed = getMissionLinkPresentation({
    _id: 'link-3',
    missionId: 'mission-1',
    targetType: 'roadmap_task',
    targetId: 'task-2',
    targetLabel: 'Publish launch teaser',
    targetRoute: '/dashboard',
    metadata: {
      sourceTool: 'completeRoadmapTask',
      xpEarned: 20,
    },
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  });

  expect(completed).toEqual({
    title: 'Publish launch teaser',
    badgeLabel: 'Completed task',
    detail: 'Marked complete on the roadmap and awarded 20 XP.',
    routeLabel: 'Open Roadmap',
    icon: 'roadmap_task',
  });
});

it('getMissionLinkPresentation falls back to generic record messaging for other links', () => {
  const presentation = getMissionLinkPresentation({
    _id: 'link-4',
    missionId: 'mission-1',
    targetType: 'contact',
    targetId: 'contact-9',
    targetLabel: 'Contact record',
    targetRoute: '/crm/contacts/contact-9',
    metadata: {
      sourceTool: 'createContact',
    },
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  });

  expect(presentation).toEqual({
    title: 'Contact record',
    badgeLabel: 'Contact',
    detail: 'Linked contact record available in its native module.',
    routeLabel: 'Open Record',
    icon: 'record',
  });
});
