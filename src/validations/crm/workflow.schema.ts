import { z } from 'zod';

// Workflow trigger types
export const workflowTriggerTypeSchema = z.enum([
  'record_created',
  'record_updated',
  'field_changed',
  'deal_stage_changed', // Changed from 'stage_changed' as per example
  // Marketing Email Triggers
  'marketing_email_opened',
  'marketing_email_clicked',
  'marketing_email_bounced',
  'marketing_email_unsubscribed',
  'deal_won',
  'deal_lost',
  'tag_added',
  'tag_removed',
  'scheduled',
  'manual',
  'webhook_received',
]);

// Workflow action types
export const workflowActionTypeSchema = z.enum([
  'update_field',
  'add_tag',
  'remove_tag',
  'assign_owner',
  'create_task',
  'create_activity',
  'send_email',
  'send_marketing_email', // Added for Marketing Email Module
  'send_webhook',
  'send_whatsapp',
  'create_deal',
  'move_stage',
  'wait',
  'condition',
]);

// Workflow trigger config schema
export const workflowTriggerConfigSchema = z.object({
  field: z.string().optional(),
  fromValue: z.any().optional(),
  toValue: z.any().optional(),
  stageId: z.string().optional(),
  tagId: z.string().optional(),
  schedule: z.string().optional(), // Cron expression
  webhookPath: z.string().optional(),
});

// Workflow trigger schema
export const workflowTriggerSchema = z.object({
  type: workflowTriggerTypeSchema,
  entityType: z.enum(['contact', 'company', 'deal']),
  config: workflowTriggerConfigSchema.default({}),
});

// Workflow condition schema
export const workflowConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.any(),
  conjunction: z.enum(['and', 'or']).default('and'),
});

// Workflow action config schema
export const workflowActionConfigSchema = z.object({
  // For update_field
  field: z.string().optional(),
  value: z.any().optional(),
  // For add_tag/remove_tag
  tagId: z.string().optional(),
  // For assign_owner
  ownerId: z.string().optional(),
  assignmentType: z.enum(['specific', 'round_robin', 'load_balanced']).optional(),
  // For create_task
  subject: z.string().optional(),
  dueInDays: z.number().optional(),
  assignTo: z.enum(['owner', 'specific', 'creator']).optional(),
  assignToUserId: z.string().optional(),
  // For send_email (old/generic)
  templateId: z.string().optional(),
  body: z.string().optional(),
  from: z.string().optional(),
  // For send_marketing_email
  marketingTemplateId: z.string().optional(),
  marketingProviderId: z.string().optional(),
  // For send_webhook
  url: z.string().url().optional(),
  method: z.enum(['POST', 'PUT']).optional(),
  headers: z.record(z.string()).optional(),
  bodyTemplate: z.string().optional(),
  // For send_whatsapp
  templateName: z.string().optional(),
  templateParams: z.array(z.string()).optional(),
  // For create_deal
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  name: z.string().optional(),
  // For wait
  waitDays: z.number().min(0).optional(),
  waitHours: z.number().min(0).optional(),
  // For condition (branching)
  conditions: z.array(workflowConditionSchema).optional(),
  thenActions: z.array(z.any()).optional(), // Will be validated recursively
  elseActions: z.array(z.any()).optional(), // Will be validated recursively
});

// Workflow action schema
export const workflowActionSchema = z.object({
  type: workflowActionTypeSchema,
  config: workflowActionConfigSchema.default({}),
});

// Create workflow schema
export const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(200),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(false),
  trigger: workflowTriggerSchema,
  conditions: z.array(workflowConditionSchema).default([]),
  actions: z.array(workflowActionSchema).min(1, 'At least one action is required'),
  runOnce: z.boolean().default(false),
  maxExecutions: z.number().min(0).optional(),
  cooldownMinutes: z.number().min(0).optional(),
});

// Update workflow schema (all fields optional)
export const updateWorkflowSchema = createWorkflowSchema.partial();

// Activate/deactivate workflow schema
export const activateWorkflowSchema = z.object({
  isActive: z.boolean(),
});

// Test workflow schema
export const testWorkflowSchema = z.object({
  entityId: z.string().min(1),
  dryRun: z.boolean().default(true),
});

// Workflow filter schema
export const workflowFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  triggerType: workflowTriggerTypeSchema.optional(),
  entityType: z.enum(['contact', 'company', 'deal']).optional(),
  createdById: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Workflow execution log filter schema
export const workflowExecutionLogFilterSchema = z.object({
  workflowId: z.string().min(1),
  status: z.enum(['success', 'failed', 'partial']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Type exports
export type WorkflowTriggerType = z.infer<typeof workflowTriggerTypeSchema>;
export type WorkflowActionType = z.infer<typeof workflowActionTypeSchema>;
export type WorkflowTriggerConfigInput = z.infer<typeof workflowTriggerConfigSchema>;
export type WorkflowTriggerInput = z.infer<typeof workflowTriggerSchema>;
export type WorkflowConditionInput = z.infer<typeof workflowConditionSchema>;
export type WorkflowActionConfigInput = z.infer<typeof workflowActionConfigSchema>;
export type WorkflowActionInput = z.infer<typeof workflowActionSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ActivateWorkflowInput = z.infer<typeof activateWorkflowSchema>;
export type TestWorkflowInput = z.infer<typeof testWorkflowSchema>;
export type WorkflowFilterInput = z.infer<typeof workflowFilterSchema>;
export type WorkflowExecutionLogFilterInput = z.infer<typeof workflowExecutionLogFilterSchema>;
