
import { it, expect } from 'vitest';
import { groupMissionLinks } from './mission-link-groups';

const links = [
  {
    _id: 'link-brand-memory',
    missionId: 'mission-1',
    targetType: 'brand_memory',
    targetId: 'kb-1',
    targetLabel: 'Voice and tone guardrails',
    targetRoute: '/settings?tab=brand-memory',
    metadata: undefined,
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  },
  {
    _id: 'link-contact',
    missionId: 'mission-1',
    targetType: 'contact',
    targetId: 'contact-1',
    targetLabel: 'Contact record',
    targetRoute: '/crm/contacts/contact-1',
    metadata: undefined,
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  },
  {
    _id: 'link-roadmap',
    missionId: 'mission-1',
    targetType: 'roadmap_task',
    targetId: 'task-1',
    targetLabel: 'Draft launch email sequence',
    targetRoute: '/dashboard',
    metadata: undefined,
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  },
  {
    _id: 'link-view',
    missionId: 'mission-1',
    targetType: 'view',
    targetId: '/social/analytics',
    targetLabel: 'Social Analytics',
    targetRoute: '/social/analytics',
    metadata: undefined,
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  },
  {
    _id: 'link-draft',
    missionId: 'mission-1',
    targetType: 'draft',
    targetId: 'draft-1',
    targetLabel: 'Social draft',
    targetRoute: '/social/drafts',
    metadata: undefined,
    createdAt: '2026-04-02T12:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
  },
];

it('groupMissionLinks organizes mission links into stable right-rail sections', () => {
  const groups = groupMissionLinks(links);

  expect(groups.map((group) => ({
      id: group.id,
      label: group.label,
      count: group.links.length,
    }))).toEqual([
      { id: 'knowledge', label: 'Knowledge', count: 1 },
      { id: 'roadmap', label: 'Roadmap', count: 1 },
      { id: 'records', label: 'Records', count: 2 },
      { id: 'views', label: 'Views', count: 1 },
    ]);

  expect(groups[0]?.links[0]?._id).toBe('link-brand-memory');
  expect(groups[1]?.links[0]?._id).toBe('link-roadmap');
  expect(groups[2]?.links[0]?._id).toBe('link-contact');
  expect(groups[2]?.links[1]?._id).toBe('link-draft');
  expect(groups[3]?.links[0]?._id).toBe('link-view');
});

it('groupMissionLinks omits empty groups', () => {
  const groups = groupMissionLinks([links[1], links[4]]);

  expect(groups.map((group) => group.id)).toEqual(['records']);
});
