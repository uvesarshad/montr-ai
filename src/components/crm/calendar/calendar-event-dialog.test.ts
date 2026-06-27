import { it, expect } from 'vitest';

import { format } from 'date-fns';

import { CalendarAccount } from '@/hooks/crm/use-calendar-accounts';
import { CalendarEvent } from '@/hooks/crm/use-calendar-events';
import {
  buildCalendarEventFormState,
  buildCalendarEventPayload,
  getDefaultCalendarSelection,
} from './calendar-event-dialog-helpers';

const accounts: CalendarAccount[] = [
  {
    id: 'account-1',
    email: 'owner@montr.ai',
    provider: 'google',
    isActive: true,
    calendars: [
      {
        calendarId: 'calendar-secondary',
        name: 'Secondary',
        isPrimary: false,
        syncEnabled: true,
        accessRole: 'writer',
      },
      {
        calendarId: 'calendar-primary',
        name: 'Primary',
        isPrimary: true,
        syncEnabled: true,
        accessRole: 'owner',
      },
    ],
    syncEnabled: true,
    syncDirection: 'two_way',
    autoLinkContacts: true,
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
  },
];

it('getDefaultCalendarSelection picks the primary calendar from the first account', () => {
  expect(getDefaultCalendarSelection(accounts)).toEqual({
    accountId: 'account-1',
    calendarId: 'calendar-primary',
  });
});

it('buildCalendarEventPayload normalizes attendees and clears blank optional fields', () => {
  const payload = buildCalendarEventPayload({
    accountId: 'account-1',
    calendarId: 'calendar-primary',
    title: 'Discovery Call',
    description: '',
    location: '',
    meetingLink: '',
    startTime: '2026-03-22T09:00',
    endTime: '2026-03-22T10:00',
    attendeeEmails: 'ava@example.com, ben@example.com ',
  });

  expect(payload.title).toBe('Discovery Call');
  expect(payload.description).toBe(undefined);
  expect(payload.location).toBe(undefined);
  expect(payload.meetingLink).toBe(undefined);
  expect(payload.attendees.length).toBe(2);
  expect(payload.attendees.map((attendee) => attendee.email)).toEqual([
    'ava@example.com',
    'ben@example.com',
  ]);
  expect(payload.startTime instanceof Date).toBe(true);
  expect(payload.endTime instanceof Date).toBe(true);
});

it('buildCalendarEventFormState maps an existing event into editable field values', () => {
  const event: CalendarEvent = {
    id: 'event-1',
    accountId: 'account-1',
    eventId: 'google-event-1',
    calendarId: 'calendar-primary',
    title: 'Quarterly Review',
    description: 'Review pipeline health',
    location: 'Conference Room',
    meetingLink: 'https://meet.example.com/review',
    startTime: new Date('2026-03-22T09:00:00.000Z'),
    endTime: new Date('2026-03-22T10:30:00.000Z'),
    timezone: 'UTC',
    isAllDay: false,
    isRecurring: false,
    attendees: [
      {
        email: 'ava@example.com',
        name: 'Ava',
        status: 'accepted',
        optional: false,
      },
      {
        email: 'ben@example.com',
        status: 'tentative',
        optional: false,
      },
    ],
    status: 'confirmed',
    contactIds: [],
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedAt: new Date('2026-03-21T00:00:00.000Z'),
  };

  expect(buildCalendarEventFormState(event)).toEqual({
    accountId: 'account-1',
    calendarId: 'calendar-primary',
    title: 'Quarterly Review',
    description: 'Review pipeline health',
    location: 'Conference Room',
    meetingLink: 'https://meet.example.com/review',
    startTime: format(new Date('2026-03-22T09:00:00.000Z'), "yyyy-MM-dd'T'HH:mm"),
    endTime: format(new Date('2026-03-22T10:30:00.000Z'), "yyyy-MM-dd'T'HH:mm"),
    attendeeEmails: 'ava@example.com, ben@example.com',
  });
});
