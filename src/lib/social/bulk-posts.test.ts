import { it, expect } from 'vitest';

import {
  createBulkDraftPersistenceState,
  convertBulkPostRowsToDrafts,
  createInitialBulkPostDraftRows,
  getBulkDraftStorageKey,
  getInstagramPublishMode,
  getNextBulkDraftRowCounter,
  matchBulkChannels,
  parseBulkDraftPersistenceState,
  getUnsupportedVideoPublishMessage,
  inferBulkMediaType,
  normalizeBulkPostRows,
} from './bulk-posts';
import {
  requiresSocialPostApproval,
  resolveSocialSubmissionDecision,
} from './post-submission';

it('normalizeBulkPostRows trims rows and splits media urls and channels', () => {
  const result = normalizeBulkPostRows([
    {
      content: ' Launch day update ',
      scheduledFor: '2026-03-25T09:30:00.000Z',
      mediaUrls:
        'https://cdn.example.com/a.mp4, https://cdn.example.com/b.jpg',
      channels: 'x, telegram',
      postFormat: ' reel ',
      altText: ' Launch teaser ',
    },
  ]);

  expect(result).toEqual([
    {
      content: 'Launch day update',
      scheduledFor: '2026-03-25T09:30:00.000Z',
      mediaUrls: [
        'https://cdn.example.com/a.mp4',
        'https://cdn.example.com/b.jpg',
      ],
      channels: ['x', 'telegram'],
      postFormat: 'reel',
      altText: 'Launch teaser',
    },
  ]);
});

it('normalizeBulkPostRows drops empty rows and defaults post format', () => {
  const result = normalizeBulkPostRows([
    {
      content: '   ',
      scheduledFor: '',
      mediaUrls: '',
      channels: '',
    },
    {
      content: 'Second post',
      scheduledFor: '2026-03-26T10:00:00.000Z',
      mediaUrls: '',
      channels: '',
    },
  ]);

  expect(result).toEqual([
    {
      content: 'Second post',
      scheduledFor: '2026-03-26T10:00:00.000Z',
      mediaUrls: [],
      channels: [],
      postFormat: 'standard',
      altText: '',
    },
  ]);
});

it('normalizeBulkPostRows can keep publish-now rows without a scheduled date', () => {
  const result = normalizeBulkPostRows(
    [
      {
        content: 'Publish immediately',
        scheduledFor: '',
        mediaUrls: 'https://cdn.example.com/reel.mp4',
        channels: 'instagram',
        postFormat: 'reel',
      },
    ],
    { requireScheduledFor: false },
  );

  expect(result).toEqual([
    {
      content: 'Publish immediately',
      scheduledFor: '',
      mediaUrls: ['https://cdn.example.com/reel.mp4'],
      channels: ['instagram'],
      postFormat: 'reel',
      altText: '',
    },
  ]);
});

it('getInstagramPublishMode maps reel uploads to video publishing', () => {
  expect(getInstagramPublishMode({
      mediaType: 'video',
      postFormat: 'reel',
    })).toEqual({
      apiMediaType: 'REELS',
      captionField: 'caption',
      mediaField: 'video_url',
    });
});

it('getInstagramPublishMode rejects non-reel video uploads', () => {
  expect(() =>
      getInstagramPublishMode({
        mediaType: 'video',
        postFormat: 'standard',
      })).toThrow(/Instagram video publishing requires reel format\./);
});

it('inferBulkMediaType detects video extensions', () => {
  expect(inferBulkMediaType('https://cdn.example.com/clip.mp4')).toBe('video');
  expect(inferBulkMediaType('https://cdn.example.com/frame.jpg')).toBe('image');
});

it('getUnsupportedVideoPublishMessage returns current unsupported platforms', () => {
  expect(getUnsupportedVideoPublishMessage('linkedin')).toBe('LinkedIn video publishing is not supported in the current flow yet.');
  expect(getUnsupportedVideoPublishMessage('facebook')).toBe('Facebook video publishing is not supported in the current flow yet.');
  expect(getUnsupportedVideoPublishMessage('dribbble')).toBe('Dribbble video publishing is not supported.');
  expect(getUnsupportedVideoPublishMessage('x')).toBe(null);
});

it('createInitialBulkPostDraftRows returns three blank editable rows by default', () => {
  const result = createInitialBulkPostDraftRows();

  expect(result.length).toBe(3);
  expect(result.map((row) => row.id)).toEqual(['bulk-row-1', 'bulk-row-2', 'bulk-row-3']);
  expect(result.map((row) => row.postFormat)).toEqual(['standard', 'standard', 'standard']);
});

it('convertBulkPostRowsToDrafts flattens parsed rows back into table values', () => {
  const result = convertBulkPostRowsToDrafts([
    {
      content: 'Launch update',
      scheduledFor: '2026-03-28T10:00:00.000Z',
      mediaUrls: ['https://cdn.example.com/a.mp4', 'https://cdn.example.com/b.jpg'],
      channels: ['instagram', '@brand'],
      postFormat: 'reel',
      altText: 'Product teaser',
    },
  ]);

  expect(result).toEqual([
    {
      id: 'bulk-row-1',
      content: 'Launch update',
      scheduledFor: '2026-03-28T10:00:00.000Z',
      mediaUrls: 'https://cdn.example.com/a.mp4, https://cdn.example.com/b.jpg',
      channels: 'instagram, @brand',
      postFormat: 'reel',
      altText: 'Product teaser',
    },
  ]);
});

it('matchBulkChannels maps imported channel tokens to matching account ids', () => {
  const result = matchBulkChannels(
    ['instagram', '@montrai', 'telegram newsroom'],
    [
      {
        _id: 'account-1',
        platform: 'instagram',
        platformUsername: 'montrai',
        platformDisplayName: 'Montr AI',
      },
      {
        _id: 'account-2',
        platform: 'telegram',
        platformUsername: 'newsroom',
        platformDisplayName: 'Telegram Newsroom',
      },
    ],
  );

  expect(result).toEqual(['account-1', 'account-2']);
});

it('createBulkDraftPersistenceState normalizes incomplete draft payloads', () => {
  const result = createBulkDraftPersistenceState({
    bulkRows: [
      {
        id: 'bulk-row-7',
        content: 'Draft post',
        scheduledFor: '',
        mediaUrls: 'https://cdn.example.com/asset.jpg',
        channels: 'account-1',
        postFormat: 'standard',
        altText: 'Draft image',
      },
    ],
    selectedAccountIds: ['account-1'],
    selectedTelegramChannels: { 'account-2': ['chat-1'] },
    bulkImportName: 'launch.csv',
  });

  expect(result.bulkRows.length).toBe(3);
  expect(result.bulkRows[0]?.id).toBe('bulk-row-7');
  expect(result.bulkRows[1]?.id).toBe('bulk-row-2');
  expect(result.bulkImportName).toBe('launch.csv');
  expect(result.selectedAccountIds).toEqual(['account-1']);
  expect(result.selectedTelegramChannels).toEqual({ 'account-2': ['chat-1'] });
});

it('parseBulkDraftPersistenceState returns null for invalid saved data', () => {
  expect(parseBulkDraftPersistenceState('not-json')).toBe(null);
  expect(parseBulkDraftPersistenceState(JSON.stringify({ bulkRows: 'bad-shape' }))).toBe(null);
});

it('parseBulkDraftPersistenceState restores a saved bulk workspace draft', () => {
  const result = parseBulkDraftPersistenceState(JSON.stringify({
    bulkRows: [
      {
        id: 'bulk-row-5',
        content: 'Queued launch post',
        scheduledFor: '2026-03-29T10:00:00.000Z',
        mediaUrls: 'https://cdn.example.com/launch.mp4',
        channels: 'account-3',
        postFormat: 'reel',
        altText: 'Launch clip',
      },
    ],
    selectedAccountIds: ['account-3'],
    selectedTelegramChannels: { 'account-4': ['chat-9'] },
    bulkImportName: 'restored.csv',
  }));

  expect(result).toEqual({
    bulkRows: [
      {
        id: 'bulk-row-5',
        content: 'Queued launch post',
        scheduledFor: '2026-03-29T10:00:00.000Z',
        mediaUrls: 'https://cdn.example.com/launch.mp4',
        channels: 'account-3',
        postFormat: 'reel',
        altText: 'Launch clip',
      },
      {
        id: 'bulk-row-2',
        content: '',
        scheduledFor: '',
        mediaUrls: '',
        channels: '',
        postFormat: 'standard',
        altText: '',
      },
      {
        id: 'bulk-row-3',
        content: '',
        scheduledFor: '',
        mediaUrls: '',
        channels: '',
        postFormat: 'standard',
        altText: '',
      },
    ],
    selectedAccountIds: ['account-3'],
    selectedTelegramChannels: { 'account-4': ['chat-9'] },
    bulkImportName: 'restored.csv',
  });
});

it('getNextBulkDraftRowCounter increments beyond the highest saved row id', () => {
  const result = getNextBulkDraftRowCounter([
    {
      id: 'bulk-row-2',
      content: '',
      scheduledFor: '',
      mediaUrls: '',
      channels: '',
      postFormat: 'standard',
      altText: '',
    },
    {
      id: 'bulk-row-8',
      content: '',
      scheduledFor: '',
      mediaUrls: '',
      channels: '',
      postFormat: 'standard',
      altText: '',
    },
  ]);

  expect(result).toBe(9);
});

it('getBulkDraftStorageKey scopes persisted workspace drafts per brand', () => {
  expect(getBulkDraftStorageKey('brand-42')).toBe('social.bulk-posts.draft.brand-42');
});

it('requiresSocialPostApproval detects social submission approval flags', () => {
  expect(requiresSocialPostApproval([])).toBe(false);
  expect(requiresSocialPostApproval(['sendWhatsApp'])).toBe(false);
  expect(requiresSocialPostApproval(['schedulePost'])).toBe(true);
  expect(requiresSocialPostApproval(['publishPost'])).toBe(true);
  // Intent-aware: only the matching brand flag counts.
  expect(requiresSocialPostApproval(['schedulePost'], 'schedule')).toBe(true);
  expect(requiresSocialPostApproval(['schedulePost'], 'publish')).toBe(false);
  expect(requiresSocialPostApproval(['publishPost'], 'publish')).toBe(true);
});

it('resolveSocialSubmissionDecision sends user actions to approval on brand override (org policy off)', () => {
  expect(resolveSocialSubmissionDecision({
      orgPolicy: null,
      brandRequireApproval: ['schedulePost'],
      userRole: 'user',
      intent: 'schedule',
    })).toEqual({
      initialStatus: 'pending_approval',
      requiresApproval: true,
      shouldQueueImmediately: false,
    });
});

it('resolveSocialSubmissionDecision lets admins bypass the brand override when org policy is off', () => {
  expect(resolveSocialSubmissionDecision({
      orgPolicy: null,
      brandRequireApproval: ['schedulePost'],
      userRole: 'admin',
      intent: 'schedule',
    })).toEqual({
      initialStatus: 'scheduled',
      requiresApproval: false,
      shouldQueueImmediately: true,
    });
});

it('resolveSocialSubmissionDecision keeps direct submission enabled when approval is off everywhere', () => {
  expect(resolveSocialSubmissionDecision({
      orgPolicy: null,
      brandRequireApproval: [],
      userRole: 'user',
      intent: 'schedule',
    })).toEqual({
      initialStatus: 'scheduled',
      requiresApproval: false,
      shouldQueueImmediately: true,
    });
});

it('resolveSocialSubmissionDecision: org policy disabled is a no-op even with fields set', () => {
  const decision = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: false, appliesTo: 'all_members', requireFor: ['schedule', 'publish'] },
    brandRequireApproval: [],
    userRole: 'user',
    intent: 'schedule',
  });
  expect(decision.requiresApproval).toBe(false);
});

it('resolveSocialSubmissionDecision: org policy (non_admins) gates members but auto-approves admins', () => {
  const member = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: true, appliesTo: 'non_admins', requireFor: ['schedule', 'publish'] },
    brandRequireApproval: [],
    userRole: 'user',
    intent: 'schedule',
  });
  expect(member.requiresApproval).toBe(true);
  expect(member.initialStatus).toBe('pending_approval');

  const admin = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: true, appliesTo: 'non_admins', requireFor: ['schedule', 'publish'] },
    brandRequireApproval: [],
    userRole: 'admin',
    intent: 'schedule',
  });
  expect(admin.requiresApproval).toBe(false);
});

it('resolveSocialSubmissionDecision: org policy (all_members) gates admins too', () => {
  const admin = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: true, appliesTo: 'all_members', requireFor: ['schedule', 'publish'] },
    brandRequireApproval: [],
    userRole: 'admin',
    intent: 'publish',
  });
  expect(admin.requiresApproval).toBe(true);
  expect(admin.initialStatus).toBe('pending_approval');
});

it('resolveSocialSubmissionDecision: org requireFor respects the intent', () => {
  const schedule = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: true, appliesTo: 'non_admins', requireFor: ['publish'] },
    brandRequireApproval: [],
    userRole: 'user',
    intent: 'schedule',
  });
  expect(schedule.requiresApproval).toBe(false);

  const publish = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: true, appliesTo: 'non_admins', requireFor: ['publish'] },
    brandRequireApproval: [],
    userRole: 'user',
    intent: 'publish',
  });
  expect(publish.requiresApproval).toBe(true);
});

it('resolveSocialSubmissionDecision: brand override adds approval on top of an org policy that skips the intent', () => {
  const decision = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: true, appliesTo: 'non_admins', requireFor: ['publish'] },
    brandRequireApproval: ['schedulePost'],
    userRole: 'user',
    intent: 'schedule',
  });
  expect(decision.requiresApproval).toBe(true);
});

it('resolveSocialSubmissionDecision: brand override cannot weaken the org policy', () => {
  // Brand has no requireApproval flags, but the org policy still applies.
  const decision = resolveSocialSubmissionDecision({
    orgPolicy: { enabled: true, appliesTo: 'all_members', requireFor: ['schedule', 'publish'] },
    brandRequireApproval: [],
    userRole: 'super_admin',
    intent: 'schedule',
  });
  expect(decision.requiresApproval).toBe(true);
});
