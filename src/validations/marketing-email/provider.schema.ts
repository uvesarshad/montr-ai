
import { z } from 'zod';

export const marketingProviderTypeSchema = z.enum(['brevo', 'ses', 'smtp']);

export const createMarketingProviderSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    type: marketingProviderTypeSchema,
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),

    credentials: z.object({
        // Brevo
        apiKey: z.string().optional(),

        // SES
        accessKeyId: z.string().optional(),
        secretAccessKey: z.string().optional(),
        region: z.string().optional(),

        // SMTP
        host: z.string().optional(),
        port: z.number().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        secure: z.boolean().optional(),
    }),

    fromEmail: z.string().email('Invalid email address'),
    fromName: z.string().min(1, 'Sender name is required'),
    replyToEmail: z.string().email().optional().or(z.literal('')),

    dailyLimit: z.number().min(0).optional(),
    hourlyLimit: z.number().min(0).optional(),
});

export const updateMarketingProviderSchema = createMarketingProviderSchema.partial();

export type CreateMarketingProviderInput = z.infer<typeof createMarketingProviderSchema>;
export type UpdateMarketingProviderInput = z.infer<typeof updateMarketingProviderSchema>;
