import { z } from 'zod';

export const dedupeEntityTypeSchema = z.enum(['contact', 'company', 'deal']);

export const dedupeCriterionSchema = z.object({
  // AND of field names. Lightly validated — we accept any non-empty string so
  // custom fields work; the service ignores fields a record doesn't have.
  fields: z.array(z.string().trim().min(1)).min(1),
});

export const updateDedupeRulesSchema = z.object({
  entityType: dedupeEntityTypeSchema,
  criteria: z.array(dedupeCriterionSchema).max(20),
  isActive: z.boolean().optional().default(true),
});

export type UpdateDedupeRulesInput = z.infer<typeof updateDedupeRulesSchema>;
