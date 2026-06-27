import { z } from 'zod';

/**
 * Org/brand-level variable (H8) validation.
 *
 * `key` is referenced in expressions as `vars.<key>`, so it must be a valid
 * identifier-ish token (no dots/spaces) to keep `{{vars.x}}` parsing clean.
 */
const keySchema = z
  .string()
  .trim()
  .min(1, 'Key is required')
  .max(64)
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    'Key must start with a letter/underscore and contain only letters, numbers, and underscores'
  );

export const createOrgVariableSchema = z.object({
  key: keySchema,
  value: z.string().max(10_000).default(''),
  brandId: z.string().trim().min(1).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

export const updateOrgVariableSchema = z.object({
  key: keySchema.optional(),
  value: z.string().max(10_000).optional(),
  brandId: z.string().trim().min(1).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

export type CreateOrgVariableInput = z.infer<typeof createOrgVariableSchema>;
export type UpdateOrgVariableInput = z.infer<typeof updateOrgVariableSchema>;
