import { z } from 'zod';

/** Entity types a manual CRM automation can run against. */
export const crmAutomationEntityType = z.enum(['contact', 'company', 'deal']);
export type CrmAutomationEntityType = z.infer<typeof crmAutomationEntityType>;

/** Availability of a manual CRM automation: single record, bulk, or both. */
export const crmAutomationAvailability = z.enum(['single', 'bulk', 'both']);

/** Body for POST /api/v2/crm/automations/run */
export const runCrmAutomationSchema = z.object({
    workflowId: z.string().min(1),
    entityType: crmAutomationEntityType,
    recordIds: z.array(z.string().min(1)).min(1).max(100),
});

export type RunCrmAutomationInput = z.infer<typeof runCrmAutomationSchema>;
