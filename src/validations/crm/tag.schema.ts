import { z } from 'zod';

// Create tag schema
export const createTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(100),
  color: z.string().default('#6366f1'),
  description: z.string().max(500).optional(),
  type: z.enum(['contact', 'company', 'deal', 'all']).default('all'),
});

// Update tag schema (all fields optional)
export const updateTagSchema = createTagSchema.partial();

// Merge tags schema
export const mergeTagsSchema = z.object({
  sourceIds: z.array(z.string()).min(1),
  targetId: z.string().min(1),
});

// Tag filter schema
export const tagFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['contact', 'company', 'deal', 'all']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('name'),
});

// Type exports
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type MergeTagsInput = z.infer<typeof mergeTagsSchema>;
export type TagFilterInput = z.infer<typeof tagFilterSchema>;
