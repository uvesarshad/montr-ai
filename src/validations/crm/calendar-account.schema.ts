import { z } from 'zod';

// Calendar OAuth credentials schema
export const calendarOAuthCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.date().optional(),
  scope: z.string().optional(),
});

// Calendar info schema
export const calendarInfoSchema = z.object({
  calendarId: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  isPrimary: z.boolean().default(false),
  syncEnabled: z.boolean().default(true),
  accessRole: z.enum(['owner', 'writer', 'reader']).default('owner'),
});

// Create calendar account schema
export const createCalendarAccountSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  provider: z.enum(['google', 'outlook']),
  oauth: calendarOAuthCredentialsSchema,
  calendars: z.array(calendarInfoSchema).default([]),
  syncEnabled: z.boolean().default(true),
  syncDirection: z.enum(['one_way', 'two_way']).default('two_way'),
  syncStartDate: z.date().optional(),
  autoLinkContacts: z.boolean().default(true),
});

// Update calendar account schema
export const updateCalendarAccountSchema = z.object({
  displayName: z.string().optional(),
  isActive: z.boolean().optional(),
  calendars: z.array(calendarInfoSchema).optional(),
  syncEnabled: z.boolean().optional(),
  syncDirection: z.enum(['one_way', 'two_way']).optional(),
  syncStartDate: z.date().optional(),
  autoLinkContacts: z.boolean().optional(),
  oauth: calendarOAuthCredentialsSchema.optional(),
});

// Update sync state schema
export const updateCalendarSyncStateSchema = z.object({
  lastSyncAt: z.date().optional(),
  lastSyncError: z.string().optional(),
  syncToken: z.string().optional(),
});

// Toggle calendar sync schema
export const toggleCalendarSyncSchema = z.object({
  calendarId: z.string().min(1),
  syncEnabled: z.boolean(),
});

// Calendar account filter schema
export const calendarAccountFilterSchema = z.object({
  userId: z.string().optional(),
  provider: z.enum(['google', 'outlook']).optional(),
  isActive: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Trigger calendar sync schema
export const triggerCalendarSyncSchema = z.object({
  calendarIds: z.array(z.string()).optional(),
  fullSync: z.boolean().default(false),
});

// Type exports
export type CalendarOAuthCredentialsInput = z.infer<typeof calendarOAuthCredentialsSchema>;
export type CalendarInfoInput = z.infer<typeof calendarInfoSchema>;
export type CreateCalendarAccountInput = z.infer<typeof createCalendarAccountSchema>;
export type UpdateCalendarAccountInput = z.infer<typeof updateCalendarAccountSchema>;
export type UpdateCalendarSyncStateInput = z.infer<typeof updateCalendarSyncStateSchema>;
export type ToggleCalendarSyncInput = z.infer<typeof toggleCalendarSyncSchema>;
export type CalendarAccountFilterInput = z.infer<typeof calendarAccountFilterSchema>;
export type TriggerCalendarSyncInput = z.infer<typeof triggerCalendarSyncSchema>;
