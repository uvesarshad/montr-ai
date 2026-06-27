import { z } from 'zod';

// Webhook events
export const webhookEventSchema = z.enum([
  // Contact events
  'contact.created',
  'contact.updated',
  'contact.deleted',
  // Company events
  'company.created',
  'company.updated',
  'company.deleted',
  // Deal events
  'deal.created',
  'deal.updated',
  'deal.deleted',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  // Activity events
  'activity.created',
  'task.completed',
  // Email events
  'email.received',
  'email.sent',
]);

// Webhook filter schema (for filtering which records trigger the webhook)
export const webhookFilterSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.any(),
});

// Create webhook schema
export const createWebhookSchema = z.object({
  name: z.string().min(1, 'Webhook name is required').max(200),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
  url: z.string().url('Invalid webhook URL'),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  headers: z.record(z.string()).default({}),
  secret: z.string().max(200).optional(),
  events: z.array(webhookEventSchema).min(1, 'At least one event is required'),
  filters: z.array(webhookFilterSchema).default([]),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelaySeconds: z.number().min(0).default(60),
});

// Update webhook schema (all fields optional)
export const updateWebhookSchema = createWebhookSchema.partial();

// Test webhook schema
export const testWebhookSchema = z.object({
  event: webhookEventSchema,
  payload: z.record(z.any()).optional(),
});

// Webhook filter input schema
export const webhookListFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  event: webhookEventSchema.optional(),
  createdById: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Webhook log filter schema
export const webhookLogFilterSchema = z.object({
  webhookId: z.string().min(1),
  event: webhookEventSchema.optional(),
  success: z.boolean().optional(),
  statusCode: z.number().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Retry webhook delivery schema
export const retryWebhookDeliverySchema = z.object({
  logId: z.string().min(1),
});

// Type exports
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type WebhookFilterInput = z.infer<typeof webhookFilterSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type TestWebhookInput = z.infer<typeof testWebhookSchema>;
export type WebhookListFilterInput = z.infer<typeof webhookListFilterSchema>;
export type WebhookLogFilterInput = z.infer<typeof webhookLogFilterSchema>;
export type RetryWebhookDeliveryInput = z.infer<typeof retryWebhookDeliverySchema>;
