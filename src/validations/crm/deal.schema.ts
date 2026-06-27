import { z } from 'zod';
import { richNotesSchema } from './contact.schema';

// Stage history schema
export const dealStageHistorySchema = z.object({
  stageId: z.string(),
  stageName: z.string(),
  enteredAt: z.date(),
  exitedAt: z.date().optional(),
  duration: z.number().optional(),
});

// Create deal schema
export const createDealSchema = z.object({
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  pipelineId: z.string().min(1, 'Pipeline is required'),
  stageId: z.string().min(1, 'Stage is required'),
  name: z.string().min(1, 'Deal name is required').max(200),
  description: z.string().max(2000).optional(),
  value: z.number().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  probability: z.number().min(0).max(100).default(0),
  expectedCloseDate: z.date().optional(),
  actualCloseDate: z.date().optional(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).default('open'),
  lostReason: z.string().max(500).optional(),
  wonReason: z.string().max(500).optional(),
  ownerId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  source: z.string().max(200).optional(),
  notes: richNotesSchema.optional(),
});

// Update deal schema (all fields optional)
export const updateDealSchema = createDealSchema.partial();

// Move deal stage schema
export const moveDealStageSchema = z.object({
  stageId: z.string().min(1),
  probability: z.number().min(0).max(100).optional(),
});

// Close deal schema
export const closeDealSchema = z.object({
  status: z.enum(['won', 'lost', 'abandoned']),
  reason: z.string().max(500).optional(),
  actualCloseDate: z.date().optional(),
});

// Deal filter schema
export const dealFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  ownerId: z.string().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  closeDateAfter: z.date().optional(),
  closeDateBefore: z.date().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Bulk operation schemas
export const bulkUpdateDealSchema = z.object({
  ids: z.array(z.string()).min(1),
  updates: updateDealSchema,
});

export const bulkDeleteDealSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const bulkMoveDealStageSchema = z.object({
  ids: z.array(z.string()).min(1),
  stageId: z.string().min(1),
});

export const bulkTagDealSchema = z.object({
  ids: z.array(z.string()).min(1),
  tagIds: z.array(z.string()).min(1),
  action: z.enum(['add', 'remove']),
});

// Type exports
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type MoveDealStageInput = z.infer<typeof moveDealStageSchema>;
export type CloseDealInput = z.infer<typeof closeDealSchema>;
export type DealFilterInput = z.infer<typeof dealFilterSchema>;
export type BulkUpdateDealInput = z.infer<typeof bulkUpdateDealSchema>;
export type BulkDeleteDealInput = z.infer<typeof bulkDeleteDealSchema>;
export type BulkMoveDealStageInput = z.infer<typeof bulkMoveDealStageSchema>;
export type BulkTagDealInput = z.infer<typeof bulkTagDealSchema>;
