
import { z } from 'zod';

export const createMarketingTemplateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    subject: z.string().optional(),
    previewText: z.string().optional(),

    htmlContent: z.string().min(1, 'HTML content is required'),
    textContent: z.string().optional(),
    jsonContent: z.any().optional(), // For editor state

    variables: z.array(z.string()).default([]),

    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    isPublic: z.boolean().default(false),
});

export const updateMarketingTemplateSchema = createMarketingTemplateSchema.partial();

export const generateTemplateSchema = z.object({
    prompt: z.string().min(10, 'Prompt must be descriptive'),
    model: z.string().optional(),
    context: z.string().optional(), // Additional context like 'Newsletter' or 'Promo'
});

export type CreateMarketingTemplateInput = z.infer<typeof createMarketingTemplateSchema>;
export type UpdateMarketingTemplateInput = z.infer<typeof updateMarketingTemplateSchema>;
export type GenerateTemplateInput = z.infer<typeof generateTemplateSchema>;
