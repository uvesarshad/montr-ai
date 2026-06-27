import { it, expect } from 'vitest';

import {
  buildDraftSidebarItems,
  filterDraftSidebarItems,
  type DraftSidebarDraft,
  type DraftSidebarScheduledPost,
} from './draft-sidebar';

const drafts: DraftSidebarDraft[] = [
  {
    id: 'draft-1',
    brandId: 'brand-1',
    title: 'First draft',
    content: 'First content',
    mediaCount: 1,
    platformCount: 2,
    lastEditedAt: '2026-03-15T10:00:00.000Z',
    createdAt: '2026-03-15T09:00:00.000Z',
    scheduleCount: 0,
  },
  {
    id: 'draft-2',
    brandId: 'brand-1',
    title: 'Second draft',
    content: 'Second content',
    mediaCount: 0,
    platformCount: 1,
    lastEditedAt: '2026-03-15T11:00:00.000Z',
    createdAt: '2026-03-15T08:00:00.000Z',
    scheduleCount: 2,
  },
];

const activeScheduledPosts: DraftSidebarScheduledPost[] = [
  {
    id: 'post-1',
    sourceDraftId: 'draft-2',
    status: 'scheduled',
  },
];

it('buildDraftSidebarItems marks active scheduled drafts and repeated drafts', () => {
  const items = buildDraftSidebarItems(drafts, activeScheduledPosts);

  expect(items).toEqual([
    {
      ...drafts[0],
      isScheduled: false,
      isRepeatedPost: false,
      activeScheduledPostId: null,
    },
    {
      ...drafts[1],
      isScheduled: true,
      isRepeatedPost: true,
      activeScheduledPostId: 'post-1',
    },
  ]);
});

it('filterDraftSidebarItems returns only unscheduled drafts for unscheduled mode', () => {
  const items = buildDraftSidebarItems(drafts, activeScheduledPosts);

  expect(filterDraftSidebarItems(items, 'unscheduled').map((item) => item.id)).toEqual(['draft-1']);
});

it('buildDraftSidebarItems falls back to fingerprint matching when sourceDraftId is missing', () => {
  const items = buildDraftSidebarItems(
    [
      {
        ...drafts[0],
        matchKey: 'brand-1::first content::1::acct-a,acct-b::https://cdn.example.com/a.jpg',
      },
    ],
    [
      {
        id: 'post-legacy-1',
        status: 'scheduled',
        matchKey: 'brand-1::first content::1::acct-a,acct-b::https://cdn.example.com/a.jpg',
      },
    ],
  );

  expect(items[0]?.isScheduled).toBe(true);
  expect(items[0]?.activeScheduledPostId).toBe('post-legacy-1');
});
