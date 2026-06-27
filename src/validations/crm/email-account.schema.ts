import { z } from 'zod';

// OAuth credentials schema
export const oAuthCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.date().optional(),
  scope: z.string().optional(),
});

// IMAP config schema
export const imapConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
});

// SMTP config schema
export const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
});

// Create email account schema (OAuth)
export const createEmailAccountOAuthSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  provider: z.enum(['gmail', 'outlook']),
  oauth: oAuthCredentialsSchema,
  syncEnabled: z.boolean().default(true),
  syncFolders: z.array(z.string()).default(['INBOX', 'Sent']),
  syncStartDate: z.date().optional(),
  autoLinkContacts: z.boolean().default(true),
  autoCreateContacts: z.boolean().default(false),
  autoCreateCompanies: z.boolean().default(false),
  signature: z.string().optional(),
});

// Create email account schema (IMAP/SMTP)
export const createEmailAccountImapSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  provider: z.literal('imap'),
  imap: imapConfigSchema,
  smtp: smtpConfigSchema,
  syncEnabled: z.boolean().default(true),
  syncFolders: z.array(z.string()).default(['INBOX', 'Sent']),
  syncStartDate: z.date().optional(),
  autoLinkContacts: z.boolean().default(true),
  autoCreateContacts: z.boolean().default(false),
  autoCreateCompanies: z.boolean().default(false),
  signature: z.string().optional(),
});

// Combined create email account schema
export const createEmailAccountSchema = z.union([
  createEmailAccountOAuthSchema,
  createEmailAccountImapSchema,
]);

// Update email account schema
export const updateEmailAccountSchema = z.object({
  displayName: z.string().optional(),
  isActive: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  syncFolders: z.array(z.string()).optional(),
  syncStartDate: z.date().optional(),
  autoLinkContacts: z.boolean().optional(),
  autoCreateContacts: z.boolean().optional(),
  autoCreateCompanies: z.boolean().optional(),
  signature: z.string().optional(),
  oauth: oAuthCredentialsSchema.optional(),
  imap: imapConfigSchema.optional(),
  smtp: smtpConfigSchema.optional(),
});

// Update sync state schema
export const updateSyncStateSchema = z.object({
  lastSyncAt: z.date().optional(),
  lastSyncError: z.string().optional(),
  syncCursor: z.string().optional(),
  totalEmailsSynced: z.number().min(0).optional(),
});

// Test connection schema
export const testConnectionSchema = z.object({
  provider: z.enum(['gmail', 'outlook', 'imap']),
  imap: imapConfigSchema.optional(),
  smtp: smtpConfigSchema.optional(),
  oauth: oAuthCredentialsSchema.optional(),
});

// Email account filter schema
export const emailAccountFilterSchema = z.object({
  userId: z.string().optional(),
  provider: z.enum(['gmail', 'outlook', 'imap']).optional(),
  isActive: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Trigger sync schema
export const triggerSyncSchema = z.object({
  folders: z.array(z.string()).optional(),
  fullSync: z.boolean().default(false),
});

// Type exports
export type OAuthCredentialsInput = z.infer<typeof oAuthCredentialsSchema>;
export type ImapConfigInput = z.infer<typeof imapConfigSchema>;
export type SmtpConfigInput = z.infer<typeof smtpConfigSchema>;
export type CreateEmailAccountInput = z.infer<typeof createEmailAccountSchema>;
export type UpdateEmailAccountInput = z.infer<typeof updateEmailAccountSchema>;
export type UpdateSyncStateInput = z.infer<typeof updateSyncStateSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
export type EmailAccountFilterInput = z.infer<typeof emailAccountFilterSchema>;
export type TriggerSyncInput = z.infer<typeof triggerSyncSchema>;
