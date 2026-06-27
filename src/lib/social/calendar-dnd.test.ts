import { it, expect } from 'vitest';

import {
  buildDraftScheduledDate,
  buildRescheduledPostDate,
} from './calendar-dnd';

it('buildDraftScheduledDate defaults future drops to noon', () => {
  const now = new Date(2026, 2, 14, 9, 0, 0, 0);
  const targetDate = new Date(2026, 2, 20, 0, 0, 0, 0);

  const result = buildDraftScheduledDate({ targetDate, now });

  expect(result.getFullYear()).toBe(2026);
  expect(result.getMonth()).toBe(2);
  expect(result.getDate()).toBe(20);
  expect(result.getHours()).toBe(12);
  expect(result.getMinutes()).toBe(0);
});

it('buildDraftScheduledDate moves same-day drops into the future when noon has passed', () => {
  const now = new Date(2026, 2, 14, 15, 30, 0, 0);
  const targetDate = new Date(2026, 2, 14, 0, 0, 0, 0);

  const result = buildDraftScheduledDate({ targetDate, now });

  expect(result.getFullYear()).toBe(2026);
  expect(result.getMonth()).toBe(2);
  expect(result.getDate()).toBe(14);
  expect(result.getHours()).toBe(16);
  expect(result.getMinutes()).toBe(30);
});

it('buildRescheduledPostDate preserves the original time on a new day', () => {
  const now = new Date(2026, 2, 14, 9, 0, 0, 0);
  const originalScheduledFor = new Date(2026, 2, 18, 8, 45, 0, 0);
  const targetDate = new Date(2026, 2, 20, 0, 0, 0, 0);

  const result = buildRescheduledPostDate({ originalScheduledFor, targetDate, now });

  expect(result).toBeTruthy();
  expect(result.getFullYear()).toBe(2026);
  expect(result.getMonth()).toBe(2);
  expect(result.getDate()).toBe(20);
  expect(result.getHours()).toBe(8);
  expect(result.getMinutes()).toBe(45);
});

it('buildRescheduledPostDate returns null when dropped on the same day', () => {
  const now = new Date(2026, 2, 14, 9, 0, 0, 0);
  const originalScheduledFor = new Date(2026, 2, 18, 8, 45, 0, 0);
  const targetDate = new Date(2026, 2, 18, 0, 0, 0, 0);

  const result = buildRescheduledPostDate({ originalScheduledFor, targetDate, now });

  expect(result).toBe(null);
});

it('buildRescheduledPostDate moves same-day reschedules into the future when the original time has passed', () => {
  const now = new Date(2026, 2, 14, 15, 30, 0, 0);
  const originalScheduledFor = new Date(2026, 2, 18, 8, 45, 0, 0);
  const targetDate = new Date(2026, 2, 14, 0, 0, 0, 0);

  const result = buildRescheduledPostDate({ originalScheduledFor, targetDate, now });

  expect(result).toBeTruthy();
  expect(result.getFullYear()).toBe(2026);
  expect(result.getMonth()).toBe(2);
  expect(result.getDate()).toBe(14);
  expect(result.getHours()).toBe(16);
  expect(result.getMinutes()).toBe(30);
});
