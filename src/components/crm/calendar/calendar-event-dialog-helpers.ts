import { format } from 'date-fns';
import { CalendarAccount } from '@/hooks/crm/use-calendar-accounts';
import { CalendarEvent } from '@/hooks/crm/use-calendar-events';

export interface CalendarEventFormState {
  accountId: string;
  calendarId: string;
  title: string;
  description: string;
  location: string;
  meetingLink: string;
  startTime: string;
  endTime: string;
  attendeeEmails: string;
}

export function getDefaultCalendarSelection(accounts: CalendarAccount[]) {
  const firstAccount = accounts[0];
  if (!firstAccount) {
    return {
      accountId: '',
      calendarId: '',
    };
  }

  const primaryCalendar =
    firstAccount.calendars.find((calendar) => calendar.isPrimary) || firstAccount.calendars[0];

  return {
    accountId: firstAccount.id,
    calendarId: primaryCalendar?.calendarId || '',
  };
}

export function buildCalendarEventPayload(form: CalendarEventFormState) {
  return {
    accountId: form.accountId,
    calendarId: form.calendarId,
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    location: form.location.trim() || undefined,
    meetingLink: form.meetingLink.trim() || undefined,
    startTime: new Date(form.startTime),
    endTime: new Date(form.endTime),
    attendees: form.attendeeEmails
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({
        email,
        optional: false,
        status: 'pending' as const,
      })),
  };
}

function formatDateTimeInput(value: Date | string) {
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

export function buildCalendarEventFormState(event: CalendarEvent): CalendarEventFormState {
  return {
    accountId: event.accountId,
    calendarId: event.calendarId,
    title: event.title,
    description: event.description || '',
    location: event.location || '',
    meetingLink: event.meetingLink || '',
    startTime: formatDateTimeInput(event.startTime),
    endTime: formatDateTimeInput(event.endTime),
    attendeeEmails: event.attendees.map((attendee) => attendee.email).join(', '),
  };
}
