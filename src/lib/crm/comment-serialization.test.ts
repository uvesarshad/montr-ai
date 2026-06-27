import { it, expect } from 'vitest';

import {
  buildRemoveReactionPath,
  canManageComment,
  getCommentAuthorName,
  hasUserReacted,
  serializeCommentForClient,
} from './comment-serialization';

it('getCommentAuthorName prefers explicit name then falls back to first and last name', () => {
  expect(getCommentAuthorName({ name: 'Ava Stone', firstName: 'Ignored', lastName: 'Ignored' })).toBe('Ava Stone');
  expect(getCommentAuthorName({ firstName: 'Ava', lastName: 'Stone' })).toBe('Ava Stone');
  expect(getCommentAuthorName(undefined)).toBe('Unknown User');
});

it('serializeCommentForClient converts ids and attaches author summary', () => {
  const result = serializeCommentForClient(
    {
      _id: { toString: () => 'comment-1' },
      targetId: { toString: () => 'contact-1' },
      parentId: { toString: () => 'parent-1' },
      createdById: { toString: () => 'user-1' },
      mentions: [{ toString: () => 'user-2' }],
      reactions: [{ emoji: '🔥', userIds: [{ toString: () => 'user-1' }] }],
      body: '<p>Hello</p>',
      bodyPlain: 'Hello',
      targetType: 'contact',
      replyCount: 0,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    },
    new Map([
      ['user-1', { _id: 'user-1', name: 'Ava Stone', image: 'https://example.com/avatar.png' }],
    ])
  );

  expect(result._id).toBe('comment-1');
  expect(result.targetId).toBe('contact-1');
  expect(result.parentId).toBe('parent-1');
  expect(result.createdById).toBe('user-1');
  expect(result.mentions).toEqual(['user-2']);
  expect(result.reactions).toEqual([{ emoji: '🔥', userIds: ['user-1'] }]);
  expect(result.author).toEqual({
    id: 'user-1',
    name: 'Ava Stone',
    image: 'https://example.com/avatar.png',
  });
});

it('canManageComment allows owners and admins', () => {
  expect(canManageComment('user-1', 'user-1', 'user')).toBe(true);
  expect(canManageComment('user-1', 'user-2', 'admin')).toBe(true);
  expect(canManageComment('user-1', 'user-2', 'super_admin')).toBe(true);
  expect(canManageComment('user-1', 'user-2', 'user')).toBe(false);
});

it('hasUserReacted detects whether the current user reacted', () => {
  expect(hasUserReacted(['user-1', 'user-2'], 'user-2')).toBe(true);
  expect(hasUserReacted(['user-1', 'user-2'], 'user-3')).toBe(false);
  expect(hasUserReacted(['user-1'], undefined)).toBe(false);
});

it('buildRemoveReactionPath encodes emoji correctly', () => {
  expect(buildRemoveReactionPath('comment-1', '👍')).toBe(`/api/v2/crm/comments/comment-1/reactions/${encodeURIComponent('👍')}`);
});
