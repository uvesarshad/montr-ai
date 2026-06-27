import { z } from 'zod';

// Email address schema
export const emailAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

// Email attachment schema
export const emailAttachmentSchema = z.object({
  attachmentId: z.string().optional(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().min(0),
});

// Email tracking click schema
export const emailTrackingClickSchema = z.object({
  url: z.string().url(),
  count: z.number().min(0).default(0),
  lastClickedAt: z.date().optional(),
});

// Email tracking schema
export const emailTrackingSchema = z.object({
  opens: z.number().min(0).default(0),
  lastOpenedAt: z.date().optional(),
  clicks: z.array(emailTrackingClickSchema).default([]),
});

// Create email schema (for synced emails)
export const createEmailSchema = z.object({
  accountId: z.string().min(1),
  messageId: z.string().min(1),
  threadId: z.string().optional(),
  conversationId: z.string().optional(),
  from: emailAddressSchema,
  to: z.array(emailAddressSchema).default([]),
  cc: z.array(emailAddressSchema).default([]),
  replyTo: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).default([]),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  snippet: z.string().optional(),
  date: z.date(),
  receivedAt: z.date().optional(),
  folder: z.string().default('inbox'),
  labels: z.array(z.string()).default([]),
  isRead: z.boolean().default(false),
  isStarred: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  isDraft: z.boolean().default(false),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  isLinked: z.boolean().default(false),
  direction: z.enum(['inbound', 'outbound']),
  attachments: z.array(emailAttachmentSchema).default([]),
  hasAttachments: z.boolean().default(false),
  tracking: emailTrackingSchema.optional(),
});

// Send email schema
export const sendEmailSchema = z.object({
  accountId: z.string().min(1),
  to: z.array(emailAddressSchema).min(1),
  cc: z.array(emailAddressSchema).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  replyTo: z.string().email().optional(),
  inReplyTo: z.string().optional(), // Message ID to reply to
  references: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(), // Attachment IDs
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  trackOpens: z.boolean().default(false),
  trackClicks: z.boolean().default(false),
});

// Update email schema
export const updateEmailSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  folder: z.string().optional(),
  labels: z.array(z.string()).optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  isLinked: z.boolean().optional(),
});

// Link email schema
export const linkEmailSchema = z.object({
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
});

// Email filter schema
export const emailFilterSchema = z.object({
  accountId: z.string().optional(),
  threadId: z.string().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  folder: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  isDraft: z.boolean().optional(),
  hasAttachments: z.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  dateAfter: z.date().optional(),
  dateBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-date'),
});

// Email thread filter schema
export const emailThreadFilterSchema = z.object({
  threadId: z.string().min(1),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('date'),
});

// Bulk email operations schemas
export const bulkUpdateEmailSchema = z.object({
  ids: z.array(z.string()).min(1),
  updates: updateEmailSchema,
});

export const bulkDeleteEmailSchema = z.object({
  ids: z.array(z.string()).min(1),
});

// Type exports
export type EmailAddressInput = z.infer<typeof emailAddressSchema>;
export type EmailAttachmentInput = z.infer<typeof emailAttachmentSchema>;
export type EmailTrackingInput = z.infer<typeof emailTrackingSchema>;
export type CreateEmailInput = z.infer<typeof createEmailSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type LinkEmailInput = z.infer<typeof linkEmailSchema>;
export type EmailFilterInput = z.infer<typeof emailFilterSchema>;
export type EmailThreadFilterInput = z.infer<typeof emailThreadFilterSchema>;
export type BulkUpdateEmailInput = z.infer<typeof bulkUpdateEmailSchema>;
export type BulkDeleteEmailInput = z.infer<typeof bulkDeleteEmailSchema>;
