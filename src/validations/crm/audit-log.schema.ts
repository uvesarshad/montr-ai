import { z } from 'zod';

// Audit action types
export const auditActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'restored',
  'merged',
  'imported',
  'exported',
]);

// Audit source types
export const auditSourceSchema = z.enum([
  'ui',
  'api',
  'import',
  'workflow',
  'sync',
  'system',
]);

// Audit change schema
export const auditChangeSchema = z.object({
  field: z.string().min(1),
  oldValue: z.any().optional(),
  newValue: z.any().optional(),
  displayOld: z.string().optional(),
  displayNew: z.string().optional(),
});

// Create audit log schema
export const createAuditLogSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  entityName: z.string().optional(),
  action: auditActionSchema,
  changes: z.array(auditChangeSchema).default([]),
  source: auditSourceSchema.default('ui'),
  workflowId: z.string().optional(),
  importId: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

// Audit log filter schema
export const auditLogFilterSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: auditActionSchema.optional(),
  source: auditSourceSchema.optional(),
  userId: z.string().optional(),
  workflowId: z.string().optional(),
  importId: z.string().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  search: z.string().optional(), // Search in entityName, userName, changes
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Audit log entity filter schema (for specific entity timeline)
export const auditLogEntityFilterSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  action: auditActionSchema.optional(),
  userId: z.string().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Audit log user activity filter schema
export const auditLogUserActivityFilterSchema = z.object({
  userId: z.string().min(1),
  entityType: z.string().optional(),
  action: auditActionSchema.optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Type exports
export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditSource = z.infer<typeof auditSourceSchema>;
export type AuditChangeInput = z.infer<typeof auditChangeSchema>;
export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>;
export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;
export type AuditLogEntityFilterInput = z.infer<typeof auditLogEntityFilterSchema>;
export type AuditLogUserActivityFilterInput = z.infer<typeof auditLogUserActivityFilterSchema>;
