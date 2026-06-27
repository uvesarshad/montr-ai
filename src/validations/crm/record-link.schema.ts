import { z } from 'zod';

export const recordTypeSchema = z.enum(['contact', 'company', 'deal']);

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createRecordLinkSchema = z.object({
  sourceType: recordTypeSchema,
  sourceId: objectId,
  targetType: recordTypeSchema,
  targetId: objectId,
  // Free-form label; defaults to 'related'. Common values: referred_by,
  // related, parent, child, duplicate_of.
  linkType: z.string().trim().min(1).max(64).optional(),
});

export type CreateRecordLinkInput = z.infer<typeof createRecordLinkSchema>;
export type CrmRecordTypeInput = z.infer<typeof recordTypeSchema>;
