import { it, expect } from 'vitest';

import { buildActivitySearchParams } from './activity-query';

it('buildActivitySearchParams serializes core activity filters', () => {
  const params = buildActivitySearchParams({
    page: 3,
    limit: 50,
    search: 'renewal',
    sort: '-createdAt',
    type: 'task',
    status: 'pending',
    targetType: 'deal',
    ownerId: 'owner-1',
    overdue: true,
  });

  expect(params.get('page')).toBe('3');
  expect(params.get('limit')).toBe('50');
  expect(params.get('search')).toBe('renewal');
  expect(params.get('sort')).toBe('-createdAt');
  expect(params.get('type')).toBe('task');
  expect(params.get('status')).toBe('pending');
  expect(params.get('targetType')).toBe('deal');
  expect(params.get('ownerId')).toBe('owner-1');
  expect(params.get('overdue')).toBe('true');
});

it('buildActivitySearchParams serializes task-specific filters', () => {
  const dueAfter = new Date('2026-03-01T10:00:00.000Z');
  const dueBefore = new Date('2026-03-31T10:00:00.000Z');
  const completedAfter = new Date('2026-02-01T10:00:00.000Z');
  const completedBefore = new Date('2026-02-28T10:00:00.000Z');

  const params = buildActivitySearchParams({
    assignedTo: 'user-123',
    dueAfter,
    dueBefore,
    completedAfter,
    completedBefore,
  });

  expect(params.get('assignedTo')).toBe('user-123');
  expect(params.get('dueAfter')).toBe(dueAfter.toISOString());
  expect(params.get('dueBefore')).toBe(dueBefore.toISOString());
  expect(params.get('completedAfter')).toBe(completedAfter.toISOString());
  expect(params.get('completedBefore')).toBe(completedBefore.toISOString());
});
