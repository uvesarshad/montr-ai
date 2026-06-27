import { z } from 'zod';

// Pipeline stage schema
export const pipelineStageSchema = z.object({
  _id: z.string().optional(),
  name: z.string().min(1, 'Stage name is required').max(100),
  order: z.number().min(0),
  probability: z.number().min(0).max(100).default(0),
  color: z.string().default('#6366f1'),
  type: z.enum(['open', 'won', 'lost']).default('open'),
  rottenDays: z.number().min(0).optional(),
});

// Create pipeline schema
export const createPipelineSchema = z.object({
  name: z.string().min(1, 'Pipeline name is required').max(200),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  stages: z.array(pipelineStageSchema).min(1, 'At least one stage is required'),
  currency: z.string().length(3).default('USD'),
  dealRotting: z.boolean().default(false),
});

// Update pipeline schema (all fields optional except stages must have at least one)
export const updatePipelineSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  stages: z.array(pipelineStageSchema).min(1).optional(),
  currency: z.string().length(3).optional(),
  dealRotting: z.boolean().optional(),
});

// Add/update stage schemas
export const addStageSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().min(0),
  probability: z.number().min(0).max(100).default(0),
  color: z.string().default('#6366f1'),
  type: z.enum(['open', 'won', 'lost']).default('open'),
  rottenDays: z.number().min(0).optional(),
});

export const updateStageSchema = addStageSchema.partial();

export const reorderStagesSchema = z.object({
  stages: z.array(z.object({
    _id: z.string(),
    order: z.number().min(0),
  })),
});

// Pipeline filter schema
export const pipelineFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('name'),
});

// Type exports
export type PipelineStageInput = z.infer<typeof pipelineStageSchema>;
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;
export type AddStageInput = z.infer<typeof addStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
export type ReorderStagesInput = z.infer<typeof reorderStagesSchema>;
export type PipelineFilterInput = z.infer<typeof pipelineFilterSchema>;
