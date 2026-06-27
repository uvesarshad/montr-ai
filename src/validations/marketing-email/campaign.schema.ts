
import { z } from 'zod';

export const marketingCampaignTargetTypeSchema = z.enum([
    'all_contacts',
    'segment',
    'tags',
    'custom_filter',
]);

export const marketingCampaignStatusSchema = z.enum([
    'draft',
    'scheduled',
    'sending',
    'sent',
    'paused',
    'failed',
    'completed',
    'cancelled',
]);

export const createMarketingCampaignSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    providerId: z.string().optional(), // Can be set later
    templateId: z.string().optional(), // Can be set later
    subject: z.string().optional(),
    previewText: z.string().optional(),

    targetType: marketingCampaignTargetTypeSchema.default('tags'),
    targetTags: z.array(z.string()).default([]),
    targetFilter: z.any().optional(),
    excludeTags: z.array(z.string()).default([]),

    scheduledAt: z.string().datetime().optional(), // ISO string from frontend
    timezone: z.string().optional(),

    batchSize: z.number().min(1).max(5000).default(100),
    delayBetweenBatches: z.number().min(0).default(0),

    isABTest: z.boolean().default(false),
    variantA: z.object({
        subject: z.string().optional(),
        templateId: z.string().optional(),
        weight: z.number().min(0).max(100).optional(),
    }).optional(),
    variantB: z.object({
        subject: z.string().optional(),
        templateId: z.string().optional(),
        weight: z.number().min(0).max(100).optional(),
    }).optional(),
});

export const updateMarketingCampaignSchema = createMarketingCampaignSchema.partial().extend({
    status: marketingCampaignStatusSchema.optional(),
    htmlContent: z.string().optional(), // Override template
    textContent: z.string().optional(), // Override template
});

export const duplicateCampaignSchema = z.object({
    name: z.string().min(1, 'New name is required'),
});

export type CreateMarketingCampaignInput = z.infer<typeof createMarketingCampaignSchema>;
export type UpdateMarketingCampaignInput = z.infer<typeof updateMarketingCampaignSchema>;
