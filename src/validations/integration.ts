import { z } from 'zod';

/** Body of POST /api/v2/integrations — connect an api_key provider. */
export const connectApiKeyIntegrationSchema = z.object({
    provider: z.string().min(1),
    brandId: z.string().min(1).optional().nullable(),
    credentials: z.record(z.string(), z.string().min(1)).refine(
        (value) => Object.keys(value).length > 0,
        { message: 'credentials must not be empty' }
    ),
});

export type ConnectApiKeyIntegrationInput = z.infer<typeof connectApiKeyIntegrationSchema>;
