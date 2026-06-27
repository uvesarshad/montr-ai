import { it, expect } from 'vitest';

import type { IRecurrence } from '@/lib/db/models/scheduled-post.model';
import {
  computeNextOccurrence,
  expandRecurrencePreview,
} from './recurrence';

// All assertions use UTC accessors — the engine is UTC-only by design.

it('daily: next occurrence is +interval days, same time, UTC', () => {
  const recurrence: IRecurrence = { frequency: 'daily', interval: 1 };
  const from = new Date(Date.UTC(2026, 5, 14, 9, 30, 0));

  const next = computeNextOccurrence(recurrence, from);

  expect(next).toBeTruthy();
  expect(next!.getUTCFullYear()).toBe(2026);
  expect(next!.getUTCMonth()).toBe(5);
  expect(next!.getUTCDate()).toBe(15);
  expect(next!.getUTCHours()).toBe(9);
  expect(next!.getUTCMinutes()).toBe(30);
});

it('daily: interval of 3 advances three days', () => {
  const recurrence: IRecurrence = { frequency: 'daily', interval: 3 };
  const from = new Date(Date.UTC(2026, 5, 14, 12, 0, 0));

  const next = computeNextOccurrence(recurrence, from);

  expect(next).toBeTruthy();
  expect(next!.getUTCDate()).toBe(17);
  expect(next!.getUTCHours()).toBe(12);
});

it('daily: returns null past endDate', () => {
  const recurrence: IRecurrence = {
    frequency: 'daily',
    interval: 1,
    endDate: new Date(Date.UTC(2026, 5, 14, 23, 59, 0)),
  };
  const from = new Date(Date.UTC(2026, 5, 14, 9, 0, 0));

  const next = computeNextOccurrence(recurrence, from);
  expect(next).toBe(null);
});

it('weekly: without daysOfWeek fires on anchor weekday +interval weeks', () => {
  // 2026-06-14 is a Sunday (getUTCDay === 0).
  const recurrence: IRecurrence = { frequency: 'weekly', interval: 1 };
  const from = new Date(Date.UTC(2026, 5, 14, 8, 0, 0));
  expect(from.getUTCDay()).toBe(0);

  const next = computeNextOccurrence(recurrence, from);

  expect(next).toBeTruthy();
  expect(next!.getUTCDate()).toBe(21); // next Sunday
  expect(next!.getUTCDay()).toBe(0);
  expect(next!.getUTCHours()).toBe(8);
});

it('weekly: with daysOfWeek picks the next listed weekday', () => {
  // Anchor Sunday 2026-06-14; fire on Mon(1) and Wed(3).
  const recurrence: IRecurrence = {
    frequency: 'weekly',
    interval: 1,
    daysOfWeek: [1, 3],
  };
  const from = new Date(Date.UTC(2026, 5, 14, 8, 0, 0));

  const next = computeNextOccurrence(recurrence, from);

  expect(next).toBeTruthy();
  expect(next!.getUTCDay()).toBe(1); // Monday 2026-06-15
  expect(next!.getUTCDate()).toBe(15);
  expect(next!.getUTCHours()).toBe(8);
});

it('weekly: interval of 2 skips the in-between week', () => {
  const recurrence: IRecurrence = { frequency: 'weekly', interval: 2 };
  const from = new Date(Date.UTC(2026, 5, 14, 10, 0, 0)); // Sunday

  const next = computeNextOccurrence(recurrence, from);

  expect(next).toBeTruthy();
  expect(next!.getUTCDate()).toBe(28); // two Sundays later
  expect(next!.getUTCDay()).toBe(0);
});

it('monthly: next occurrence is +interval months on dayOfMonth', () => {
  const recurrence: IRecurrence = {
    frequency: 'monthly',
    interval: 1,
    dayOfMonth: 15,
  };
  const from = new Date(Date.UTC(2026, 5, 15, 9, 0, 0));

  const next = computeNextOccurrence(recurrence, from);

  expect(next).toBeTruthy();
  expect(next!.getUTCFullYear()).toBe(2026);
  expect(next!.getUTCMonth()).toBe(6); // July
  expect(next!.getUTCDate()).toBe(15);
  expect(next!.getUTCHours()).toBe(9);
});

it('monthly: clamps dayOfMonth 31 to short months', () => {
  const recurrence: IRecurrence = {
    frequency: 'monthly',
    interval: 1,
    dayOfMonth: 31,
  };
  // From Jan 31 -> Feb has 28 days in 2026.
  const from = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));

  const next = computeNextOccurrence(recurrence, from);

  expect(next).toBeTruthy();
  expect(next!.getUTCMonth()).toBe(1); // February
  expect(next!.getUTCDate()).toBe(28); // clamped
});

it('monthly: returns null past endDate', () => {
  const recurrence: IRecurrence = {
    frequency: 'monthly',
    interval: 1,
    dayOfMonth: 15,
    endDate: new Date(Date.UTC(2026, 5, 30, 0, 0, 0)),
  };
  const from = new Date(Date.UTC(2026, 5, 15, 9, 0, 0));

  const next = computeNextOccurrence(recurrence, from);
  expect(next).toBe(null);
});

it('expandRecurrencePreview returns up to count future occurrences', () => {
  const recurrence: IRecurrence = { frequency: 'daily', interval: 1 };
  const start = new Date(Date.UTC(2026, 5, 14, 9, 0, 0));

  const occ = expandRecurrencePreview(recurrence, start, 3);

  expect(occ.length).toBe(3);
  expect(occ[0].getUTCDate()).toBe(15);
  expect(occ[1].getUTCDate()).toBe(16);
  expect(occ[2].getUTCDate()).toBe(17);
});

it('expandRecurrencePreview stops at endDate', () => {
  const recurrence: IRecurrence = {
    frequency: 'daily',
    interval: 1,
    endDate: new Date(Date.UTC(2026, 5, 16, 23, 59, 0)),
  };
  const start = new Date(Date.UTC(2026, 5, 14, 9, 0, 0));

  const occ = expandRecurrencePreview(recurrence, start, 5);

  // Only Jun 15 and Jun 16 fall on/before the endDate.
  expect(occ.length).toBe(2);
  expect(occ[0].getUTCDate()).toBe(15);
  expect(occ[1].getUTCDate()).toBe(16);
});

it('unknown frequency returns null', () => {
  const recurrence = { frequency: 'yearly' as unknown as 'daily', interval: 1 } as IRecurrence;
  const from = new Date(Date.UTC(2026, 5, 14, 9, 0, 0));
  expect(computeNextOccurrence(recurrence, from)).toBe(null);
});
