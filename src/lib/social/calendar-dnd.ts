import {
  pointerWithin,
  type CollisionDetection,
} from '@dnd-kit/core';
import { isSameDay } from 'date-fns';

const DEFAULT_LEAD_TIME_MS = 60 * 60 * 1000;

interface BuildScheduledDateInput {
  now?: Date;
  targetDate: Date;
}

interface BuildRescheduledPostDateInput extends BuildScheduledDateInput {
  originalScheduledFor: Date;
}

function getFutureSafeDate(candidate: Date, now: Date) {
  if (!isSameDay(candidate, now) || candidate > now) {
    return candidate;
  }

  const nextAvailableDate = new Date(now.getTime() + DEFAULT_LEAD_TIME_MS);
  nextAvailableDate.setSeconds(0, 0);
  return nextAvailableDate;
}

export function buildDraftScheduledDate({
  targetDate,
  now = new Date(),
}: BuildScheduledDateInput) {
  const scheduledDate = new Date(targetDate);
  scheduledDate.setHours(12, 0, 0, 0);
  return getFutureSafeDate(scheduledDate, now);
}

export function buildRescheduledPostDate({
  originalScheduledFor,
  targetDate,
  now = new Date(),
}: BuildRescheduledPostDateInput) {
  if (isSameDay(originalScheduledFor, targetDate)) {
    return null;
  }

  const scheduledDate = new Date(targetDate);
  scheduledDate.setHours(
    originalScheduledFor.getHours(),
    originalScheduledFor.getMinutes(),
    0,
    0,
  );

  return getFutureSafeDate(scheduledDate, now);
}

export const socialCalendarCollisionDetection: CollisionDetection = (args) => {
  return pointerWithin(args);
};
