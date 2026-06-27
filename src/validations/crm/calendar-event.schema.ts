import { z } from 'zod';

// Event organizer schema
export const eventOrganizerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  self: z.boolean().default(false),
});

// Event attendee schema
export const eventAttendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  status: z.enum(['pending', 'accepted', 'declined', 'tentative']).default('pending'),
  optional: z.boolean().default(false),
});

// Event reminder schema
export const eventReminderSchema = z.object({
  method: z.enum(['email', 'popup']),
  minutes: z.number().min(0),
});

// Create calendar event schema (for synced events)
export const createCalendarEventSchema = z.object({
  accountId: z.string().min(1),
  eventId: z.string().min(1),
  calendarId: z.string().min(1),
  recurringEventId: z.string().optional(),
  iCalUID: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  location: z.string().max(500).optional(),
  meetingLink: z.string().url().optional().or(z.literal('')),
  startTime: z.date(),
  endTime: z.date(),
  timezone: z.string().optional(),
  isAllDay: z.boolean().default(false),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().optional(),
  recurrenceExceptions: z.array(z.date()).default([]),
  organizer: eventOrganizerSchema.optional(),
  attendees: z.array(eventAttendeeSchema).default([]),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).default('confirmed'),
  visibility: z.enum(['default', 'public', 'private']).default('default'),
  busy: z.enum(['busy', 'free']).default('busy'),
  contactIds: z.array(z.string()).default([]),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  reminders: z.array(eventReminderSchema).default([]),
  htmlLink: z.string().optional(),
  etag: z.string().optional(),
  lastSyncedAt: z.date().optional(),
}).refine((data) => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

// Create event from CRM schema (user creating event, not synced)
export const createEventFromCrmSchema = z.object({
  accountId: z.string().min(1),
  calendarId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  location: z.string().max(500).optional(),
  meetingLink: z.string().url().optional().or(z.literal('')),
  startTime: z.date(),
  endTime: z.date(),
  timezone: z.string().optional(),
  isAllDay: z.boolean().default(false),
  attendees: z.array(eventAttendeeSchema).default([]),
  contactIds: z.array(z.string()).default([]),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  reminders: z.array(eventReminderSchema).default([]),
}).refine((data) => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

// Update calendar event schema
export const updateCalendarEventSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  location: z.string().max(500).optional(),
  meetingLink: z.string().url().optional().or(z.literal('')),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  timezone: z.string().optional(),
  isAllDay: z.boolean().optional(),
  attendees: z.array(eventAttendeeSchema).optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  visibility: z.enum(['default', 'public', 'private']).optional(),
  busy: z.enum(['busy', 'free']).optional(),
  contactIds: z.array(z.string()).optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  reminders: z.array(eventReminderSchema).optional(),
}).refine((data) => {
  if (data.startTime && data.endTime) {
    return data.endTime > data.startTime;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

// Link calendar event schema
export const linkCalendarEventSchema = z.object({
  contactIds: z.array(z.string()).optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
});

// Calendar event filter schema
export const calendarEventFilterSchema = z.object({
  accountId: z.string().optional(),
  calendarId: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  startTimeAfter: z.date().optional(),
  startTimeBefore: z.date().optional(),
  endTimeAfter: z.date().optional(),
  endTimeBefore: z.date().optional(),
  search: z.string().optional(),
  isRecurring: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('startTime'),
});

// Availability check schema
export const checkAvailabilitySchema = z.object({
  accountId: z.string().min(1),
  startTime: z.date(),
  endTime: z.date(),
  attendees: z.array(z.string().email()).optional(),
}).refine((data) => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

// Type exports
export type EventOrganizerInput = z.infer<typeof eventOrganizerSchema>;
export type EventAttendeeInput = z.infer<typeof eventAttendeeSchema>;
export type EventReminderInput = z.infer<typeof eventReminderSchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type CreateEventFromCrmInput = z.infer<typeof createEventFromCrmSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type LinkCalendarEventInput = z.infer<typeof linkCalendarEventSchema>;
export type CalendarEventFilterInput = z.infer<typeof calendarEventFilterSchema>;
export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;
