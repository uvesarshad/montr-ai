import { z } from 'zod';

// Comment reaction schema
export const commentReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
  userIds: z.array(z.string()),
});

// Create comment schema
export const createCommentSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'activity']),
  targetId: z.string().min(1),
  body: z.string().min(1), // TipTap JSON content
  bodyPlain: z.string().min(1), // Plain text for notifications
  mentions: z.array(z.string()).default([]),
  parentId: z.string().optional(),
});

// Update comment schema
export const updateCommentSchema = z.object({
  body: z.string().min(1),
  bodyPlain: z.string().min(1),
  mentions: z.array(z.string()).default([]),
});

// Add reaction schema
export const addReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

// Remove reaction schema
export const removeReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

// Comment filter schema
export const commentFilterSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'activity']).optional(),
  targetId: z.string().optional(),
  parentId: z.string().optional(),
  mentionsMe: z.boolean().optional(),
  createdById: z.string().optional(),
  isDeleted: z.boolean().default(false),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Type exports
export type CommentReactionInput = z.infer<typeof commentReactionSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type AddReactionInput = z.infer<typeof addReactionSchema>;
export type RemoveReactionInput = z.infer<typeof removeReactionSchema>;
export type CommentFilterInput = z.infer<typeof commentFilterSchema>;
