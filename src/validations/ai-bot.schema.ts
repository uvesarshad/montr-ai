/**
 * Zod schemas for AiBot CRUD (B3-4.5.5).
 */

import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid ObjectId');

const channels = z.array(z.enum(['whatsapp', 'inbox', 'voice'])).default([]);

const escalationRules = z
  .object({
    keywords: z.array(z.string().min(1).max(120)).max(50).optional(),
    toolName: z.string().min(1).max(120).optional(),
    autoEscalateAfterTurns: z.number().int().min(1).max(100).optional(),
    defaultAssigneeId: objectId.optional(),
    silentEscalation: z.boolean().optional(),
  })
  .optional();

const routingDefaults = z
  .object({
    onCloseReengageAfterMs: z.number().int().min(0).optional(),
    maxToolCallsPerTurn: z.number().int().min(1).max(20).optional(),
    greetOnAssign: z.boolean().optional(),
  })
  .optional();

export const createAiBotSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  brandId: objectId.nullable().optional(),
  aiCharacterId: objectId.nullable().optional(),
  systemPrompt: z.string().min(1),
  knowledgeBaseIds: z.array(objectId).max(50).default([]),
  enabledChannels: channels,
  escalationRules,
  routingDefaults,
  llmModel: z.string().max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type CreateAiBotInput = z.infer<typeof createAiBotSchema>;

export const updateAiBotSchema = createAiBotSchema.partial().extend({
  status: z.enum(['active', 'archived']).optional(),
});

export type UpdateAiBotInput = z.infer<typeof updateAiBotSchema>;

export const testAiBotSchema = z.object({
  message: z.string().min(1).max(4000),
  channel: z.enum(['whatsapp', 'inbox', 'voice']).default('inbox'),
});

export type TestAiBotInput = z.infer<typeof testAiBotSchema>;
