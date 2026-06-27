import { z } from 'zod';

// Create attachment schema
export const createAttachmentSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'activity', 'comment', 'email']),
  targetId: z.string().min(1),
  fileName: z.string().min(1),
  fileKey: z.string().min(1),
  fileUrl: z.string().url(),
  fileSize: z.number().min(0),
  mimeType: z.string().min(1),
  extension: z.string().optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
  thumbnailUrl: z.string().url().optional(),
  thumbnailKey: z.string().optional(),
});

// Update attachment schema
export const updateAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

// Update scan status schema
export const updateScanStatusSchema = z.object({
  scanStatus: z.enum(['pending', 'clean', 'infected', 'error']),
  scannedAt: z.date().optional(),
});

// Attachment filter schema
export const attachmentFilterSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'activity', 'comment', 'email']).optional(),
  targetId: z.string().optional(),
  mimeType: z.string().optional(),
  scanStatus: z.enum(['pending', 'clean', 'infected', 'error']).optional(),
  isPublic: z.boolean().optional(),
  createdById: z.string().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Type exports
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;
export type UpdateScanStatusInput = z.infer<typeof updateScanStatusSchema>;
export type AttachmentFilterInput = z.infer<typeof attachmentFilterSchema>;
