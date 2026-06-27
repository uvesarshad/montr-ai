import { z } from 'zod';

// Activity types
export const activityTypeSchema = z.enum([
  'note',
  'task',
  'call',
  'meeting',
  'email',
  'email_sent',
  'message',
  'calendar_event',
  'deal_created',
  'deal_stage_changed',
  'deal_won',
  'deal_lost',
  'contact_created',
  'form_submission',
  'workflow_triggered',
]);

// Attendee schema
export const attendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  status: z.enum(['pending', 'accepted', 'declined']).default('pending'),
});

// Email metadata schema
export const emailMetadataSchema = z.object({
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  accountId: z.string().optional(),
  from: z.string().optional(),
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
  hasAttachments: z.boolean().optional(),
});

// Message metadata schema
export const messageMetadataSchema = z.object({
  channel: z.enum(['whatsapp', 'instagram', 'facebook', 'twitter', 'sms']).optional(),
  externalId: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']).optional(),
  campaignId: z.string().optional(),
});

// Calendar metadata schema
export const calendarMetadataSchema = z.object({
  eventId: z.string().optional(),
  accountId: z.string().optional(),
  calendarId: z.string().optional(),
  recurringEventId: z.string().optional(),
  htmlLink: z.string().optional(),
});

// Create activity schema
export const createActivitySchema = z.object({
  type: activityTypeSchema,
  subtype: z.string().max(100).optional(),
  targetType: z.enum(['contact', 'company', 'deal']),
  targetId: z.string().min(1),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  subject: z.string().max(500).optional(),
  body: z.string().optional(), // TipTap JSON content
  bodyPlain: z.string().optional(),
  // Task fields
  dueDate: z.date().optional(),
  reminderAt: z.date().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  completed: z.boolean().default(false),
  // Meeting/Call fields
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  duration: z.number().min(0).optional(),
  location: z.string().max(500).optional(),
  meetingLink: z.string().url().optional().or(z.literal('')),
  attendees: z.array(attendeeSchema).default([]),
  outcome: z.string().max(1000).optional(),
  // Metadata
  emailMetadata: emailMetadataSchema.optional(),
  messageMetadata: messageMetadataSchema.optional(),
  calendarMetadata: calendarMetadataSchema.optional(),
  // Visibility
  isPrivate: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  assignedTo: z.string().optional(),
});

// Update activity schema (all fields optional)
export const updateActivitySchema = createActivitySchema.partial();

// Complete task schema
export const completeTaskSchema = z.object({
  completed: z.boolean(),
  outcome: z.string().max(1000).optional(),
});

// Activity filter schema
export const activityFilterSchema = z.object({
  search: z.string().optional(),
  type: activityTypeSchema.optional(),
  targetType: z.enum(['contact', 'company', 'deal']).optional(),
  targetId: z.string().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  assignedTo: z.string().optional(),
  createdById: z.string().optional(),
  completed: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  dueDateAfter: z.date().optional(),
  dueDateBefore: z.date().optional(),
  startTimeAfter: z.date().optional(),
  startTimeBefore: z.date().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Timeline filter schema (unified timeline for a record)
export const timelineFilterSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal']),
  targetId: z.string().min(1),
  types: z.array(activityTypeSchema).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
});

// Type exports
export type ActivityTypeInput = z.infer<typeof activityTypeSchema>;
export type AttendeeInput = z.infer<typeof attendeeSchema>;
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;
export type ActivityFilterInput = z.infer<typeof activityFilterSchema>;
export type TimelineFilterInput = z.infer<typeof timelineFilterSchema>;
